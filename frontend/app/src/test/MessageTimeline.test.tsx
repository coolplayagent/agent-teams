import { App as AntApp, ConfigProvider } from "antd";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";

import {
  listSessionMessages,
  listSessionRounds,
  listSessionSubagents,
} from "../api/client";
import { MessageTimeline } from "../features/timeline/MessageTimeline";
import {
  recordTerminalDomSnapshot,
  readTerminalDomSnapshots,
  resetTerminalDomSnapshots,
} from "../features/timeline/terminalDomSnapshot";
import type { RelayRunEvent, StreamStatus } from "../runtime/events";
import {
  initialRuntimeState,
  reduceRunEvent,
  type RuntimeRunState,
  type TimelineEntry,
} from "../runtime/reducers";
import { useRuntimeStore } from "../runtime/runtimeStore";
import { useOptimisticRunStore } from "../runtime/optimisticRunStore";

vi.mock("../api/client", () => ({
  buildWorkspaceImagePreviewUrl: vi.fn((workspaceId: string, path: string) => {
    const params = new URLSearchParams({ path });
    return `/api/workspaces/${encodeURIComponent(workspaceId)}/preview-file?${params.toString()}`;
  }),
  listSessionMessages: vi.fn(),
  listSessionRounds: vi.fn(),
  listSessionSubagents: vi.fn(),
}));

const listSessionMessagesMock = vi.mocked(listSessionMessages);
const listSessionRoundsMock = vi.mocked(listSessionRounds);
const listSessionSubagentsMock = vi.mocked(listSessionSubagents);

beforeEach(() => {
  resetTerminalDomSnapshots();
  window.sessionStorage.removeItem("agentTeams.liveProcessedRuns");
  listSessionMessagesMock.mockReset();
  listSessionRoundsMock.mockReset();
  listSessionSubagentsMock.mockReset();
  listSessionSubagentsMock.mockResolvedValue([]);
  listSessionRoundsMock.mockResolvedValue({
    has_more: false,
    items: [],
    next_cursor: null,
  });
});

afterEach(() => {
  cleanup();
  delete document.documentElement.dataset.diagnosticsVisible;
  useRuntimeStore.getState().resetRuntimeState();
  useOptimisticRunStore.setState({ prompts: {} });
  window.sessionStorage.removeItem("agentTeams.liveProcessedRuns");
  vi.useRealTimers();
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("MessageTimeline", () => {
  it("records comparable light and settled terminal DOM snapshots", () => {
    const { container } = render(
      <div className="at-timeline">
        <article className="at-message" data-run-id="run-snapshot">
          <div className="at-message-text">stable final text</div>
        </article>
        <div data-testid="snapshot-anchor" />
      </div>,
    );
    const timeline = container.querySelector<HTMLElement>(".at-timeline");
    const anchor = container.querySelector<HTMLElement>("[data-testid='snapshot-anchor']");
    if (timeline === null || anchor === null) {
      throw new Error("Terminal snapshot fixture did not render.");
    }
    Object.defineProperty(timeline, "scrollHeight", { configurable: true, value: 900 });
    timeline.scrollTop = 240;

    recordTerminalDomSnapshot(anchor, "run-snapshot", "light");
    recordTerminalDomSnapshot(anchor, "run-snapshot", "settled");

    const snapshots = readTerminalDomSnapshots();
    expect(snapshots.map((snapshot) => snapshot.phase)).toEqual(["light", "settled"]);
    expect(snapshots[1]).toMatchObject({
      domIdentity: snapshots[0]?.domIdentity,
      scrollHeight: 900,
      scrollTop: 240,
      textHash: snapshots[0]?.textHash,
      textLength: snapshots[0]?.textLength,
    });
  });

  it("does not hydrate or poll a retained hidden timeline", async () => {
    renderTimeline("session-hidden", { visible: false });

    await act(async () => Promise.resolve());
    expect(listSessionMessagesMock).not.toHaveBeenCalled();
    expect(listSessionRoundsMock).not.toHaveBeenCalled();
  });

  it("renders runtime events without polling round history and hydrates once on terminal invalidation", async () => {
    vi.useFakeTimers();
    listSessionMessagesMock.mockResolvedValue([]);
    listSessionRoundsMock
      .mockResolvedValueOnce({
        has_more: false,
        items: [{
          created_at: "2026-07-12T09:00:00Z",
          run_id: "run-event-driven",
          run_status: "running",
          run_user_message: "event driven prompt",
        }],
        next_cursor: null,
      })
      .mockResolvedValueOnce({
        has_more: false,
        items: [{
          coordinator_messages: [],
          created_at: "2026-07-12T09:00:00Z",
          run_id: "run-event-driven",
          run_status: "completed",
          run_user_message: "event driven prompt",
        }],
        next_cursor: null,
      });

    const { queryClient } = renderTimeline();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(listSessionRoundsMock).toHaveBeenCalledTimes(1);

    act(() => {
      setRuntimeStateFromEvents([
        relayRunEvent({
          event_id: 1,
          event_type: "text_delta",
          payload_json: JSON.stringify({ text: "EVENT_DRIVEN_DELTA" }),
          run_id: "run-event-driven",
          trace_id: "run-event-driven",
        }),
      ]);
    });
    expect(screen.getByText("EVENT_DRIVEN_DELTA")).toBeVisible();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(6_000);
    });
    expect(listSessionRoundsMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await queryClient.invalidateQueries({
        queryKey: ["sessions", "session-1", "rounds"],
      });
    });
    expect(listSessionRoundsMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(6_000);
    });
    expect(listSessionRoundsMock).toHaveBeenCalledTimes(2);
  });

  it("shows local prompt and connection feedback before run creation resolves", async () => {
    listSessionMessagesMock.mockResolvedValue([]);
    renderTimeline();

    act(() => {
      useOptimisticRunStore.getState().beginPrompt("session-1", "inspect the stream");
    });

    expect(await screen.findByText("inspect the stream")).toBeVisible();
    const optimisticMarker = document.querySelector<HTMLElement>(
      '.at-round-marker[data-row-key^="optimistic-run-"]',
    );
    expect(optimisticMarker).not.toBeNull();
    expect(optimisticMarker).toHaveTextContent("Running");
    expect(screen.getByRole("status")).toHaveTextContent("Connecting to the model");
  });

  it("reconciles a confirmed local prompt without a blank or duplicate frame", async () => {
    listSessionMessagesMock.mockResolvedValue([]);
    renderTimeline();
    let promptId = "";
    act(() => {
      promptId = useOptimisticRunStore
        .getState()
        .beginPrompt("session-1", "keep this prompt visible");
    });
    expect(await screen.findAllByText("keep this prompt visible")).toHaveLength(1);
    expect(document.querySelector(`[data-row-key="${promptId}"]`)).not.toBeNull();

    act(() => {
      useRuntimeStore.setState({
        runtimeState: {
          activeRunIds: ["run-optimistic"],
          runs: {
            "run-optimistic": {
              entries: [],
              lastEventId: 0,
              promptText: "keep this prompt visible",
              runId: "run-optimistic",
              seenEventKeys: [],
              sessionId: "session-1",
              status: "connecting",
              terminalEventType: null,
            },
          },
        },
      });
      useOptimisticRunStore
        .getState()
        .confirmPrompt("session-1", promptId, "run-optimistic");
    });

    await waitFor(() => {
      expect(useOptimisticRunStore.getState().prompts["session-1"]).toBeUndefined();
    });
    expect(document.querySelector(`[data-row-key="${promptId}"]`)).toBeNull();
    expect(screen.getAllByText("keep this prompt visible").length).toBeGreaterThan(0);
  });

  it("switches a confirmed optimistic marker from terminal SSE before hydration resolves", async () => {
    listSessionMessagesMock.mockReturnValue(new Promise(() => {}));
    listSessionRoundsMock.mockReturnValue(new Promise(() => {}));
    let promptId = "";
    act(() => {
      promptId = useOptimisticRunStore
        .getState()
        .beginPrompt("session-1", "finish from the event stream");
      useOptimisticRunStore
        .getState()
        .confirmPrompt("session-1", promptId, "run-terminal-sse");
      const openRuntimeState = reduceRunEvent({
          activeRunIds: ["run-terminal-sse"],
          runs: {
            "run-terminal-sse": {
              entries: [],
              lastEventId: 0,
              promptText: "finish from the event stream",
              runId: "run-terminal-sse",
              seenEventKeys: [],
              sessionId: "session-1",
              status: "open",
              targetRoleId: "MainAgent",
              terminalEventType: null,
            },
          },
        }, {
          event_id: 1,
          event_type: "text_delta",
          occurred_at: "2026-07-12T15:44:59Z",
          payload_json: JSON.stringify({ text: "visible prefix" }),
          run_id: "run-terminal-sse",
          session_id: "session-1",
          trace_id: "run-terminal-sse",
        });
      useRuntimeStore.setState({
        runtimeState: openRuntimeState,
      });
    });
    const { container } = renderTimeline();
    expect(await screen.findAllByText("finish from the event stream"))
      .not.toHaveLength(0);
    expect(await screen.findByText("visible prefix")).toBeVisible();
    expect(container.querySelector(".at-round-marker")).toHaveTextContent(/running/i);
    act(() => {
      const runtimeStateWithTail = reduceRunEvent(
        useRuntimeStore.getState().runtimeState,
        {
          event_id: 2,
          event_type: "text_delta",
          occurred_at: "2026-07-12T15:45:00Z",
          payload_json: JSON.stringify({ text: " final tail" }),
          run_id: "run-terminal-sse",
          session_id: "session-1",
          trace_id: "run-terminal-sse",
        },
      );
      useRuntimeStore.getState().setRuntimeState(reduceRunEvent(runtimeStateWithTail, {
        event_id: 3,
        event_type: "run_completed",
        occurred_at: "2026-07-12T15:45:00Z",
        payload_json: JSON.stringify({ status: "completed" }),
        run_id: "run-terminal-sse",
        session_id: "session-1",
        trace_id: "run-terminal-sse",
      }));
    });

    expect(useRuntimeStore.getState().runtimeState.runs["run-terminal-sse"])
      .toMatchObject({ status: "closed", terminalEventType: "run_completed" });
    const marker = container.querySelector(".at-round-marker");
    expect(marker).toHaveTextContent(/completed/i);
    expect(marker).not.toHaveTextContent(/running/i);
    expect(marker).toHaveAttribute("data-run-status", "completed");
    expect(marker).toHaveAttribute(
      "data-runtime-terminal-event",
      "run_completed",
    );
    expect(container).toHaveTextContent("visible prefix final tail");
    expect(container.querySelector(".streaming-cursor")).toBeNull();
  });

  it("does not clear a confirmed prompt underneath a hidden switching timeline", async () => {
    listSessionMessagesMock.mockResolvedValue([]);
    let promptId = "";
    act(() => {
      promptId = useOptimisticRunStore
        .getState()
        .beginPrompt("session-1", "survive the ownership handoff");
      useOptimisticRunStore
        .getState()
        .confirmPrompt("session-1", promptId, "run-handoff");
      useRuntimeStore.setState({
        runtimeState: {
          activeRunIds: ["run-handoff"],
          runs: {
            "run-handoff": {
              entries: [],
              lastEventId: 0,
              promptText: "survive the ownership handoff",
              runId: "run-handoff",
              seenEventKeys: [],
              sessionId: "session-1",
              status: "connecting",
              terminalEventType: null,
            },
          },
        },
      });
    });

    renderTimeline("session-1", { visible: false });

    expect((await screen.findAllByText("survive the ownership handoff")).length)
      .toBeGreaterThan(0);
    expect(useOptimisticRunStore.getState().prompts["session-1"]?.id).toBe(promptId);
  });

  it("keeps the no-session state inside the timeline frame slot", () => {
    const { container } = renderTimeline(null);

    expect(screen.getByText("Select a session")).toBeVisible();
    expect(container.querySelector(".at-timeline-frame")).not.toBeNull();
    expect(
      container.querySelector(".at-timeline")?.closest(".at-timeline-frame"),
    ).not.toBeNull();
    expect(listSessionMessagesMock).not.toHaveBeenCalled();
  });

  it("keeps the empty message state inside the timeline frame slot", async () => {
    listSessionMessagesMock.mockResolvedValue([]);

    const { container } = renderTimeline();

    expect(await screen.findByText("No messages yet")).toBeVisible();
    expect(container.querySelector(".at-timeline-frame")).not.toBeNull();
    expect(
      container.querySelector(".at-timeline")?.closest(".at-timeline-frame"),
    ).not.toBeNull();
  });

  it("ignores legacy hydrated overlay snapshots when runtime state is empty", async () => {
    const legacySnapshot = vi.fn(() => ({
      byInstance: {},
      coordinator: {
        idleCursor: false,
        parts: [
          { content: "plan", kind: "thinking", part_index: 0, streaming: true },
          {
            args: { command: "date" },
            kind: "tool",
            status: "pending",
            tool_call_id: "call-1",
            action_family: "run",
            semantic_category: "execution",
            tool_name: "shell",
          },
        ],
        scope: {
          instanceId: "primary",
          roleId: "Main Agent",
          runId: "run-1",
          streamKey: "primary",
        },
        textStreaming: false,
      },
    }));
    vi.stubGlobal("__relayTeamsMessageTimelineGetRunSnapshot", legacySnapshot);
    listSessionMessagesMock.mockResolvedValue([]);

    const { container } = renderTimeline();

    expect(await screen.findByText("No messages yet")).toBeVisible();
    expect(legacySnapshot).not.toHaveBeenCalled();
    expect(screen.queryByText("plan")).not.toBeInTheDocument();
    expect(screen.queryByText("shell")).not.toBeInTheDocument();
    expect(container.querySelector(".at-message-thinking")).toBeNull();
    expect(container.querySelector(".at-message-tool")).toBeNull();
  });

  it("does not render entry type fallbacks for empty persisted messages", async () => {
    listSessionMessagesMock.mockResolvedValue([
      {
        entry_type: "message",
        message_id: "empty-user-message",
        role: "user",
      },
    ]);

    renderTimeline();

    expect(await screen.findByText("No messages yet")).toBeVisible();
    expect(screen.queryByText("message")).not.toBeInTheDocument();
  });

  it("hides managed background task notifications from the replay transcript", async () => {
    listSessionMessagesMock.mockResolvedValue([
      {
        message: {
          parts: [
            {
              content: [
                "A managed background task finished. The notification below includes the same result payload returned by wait_background_task(background_task_id).",
                "<background-task-notification>",
                "<background-task-id>background_task_1</background-task-id>",
                "<tool-call-id>call_1</tool-call-id>",
                "<kind>subagent</kind>",
                "<status>failed</status>",
                "<title>Subagent failed</title>",
                "</background-task-notification>",
              ].join("\n"),
              part_kind: "user-prompt",
            },
          ],
        },
        message_id: "internal-background-task-notification",
        role: "user",
        trace_id: "run-1",
        visibility: "internal",
      },
      {
        content: "Subagent failed because the context limit was exceeded.",
        message_id: "assistant-final",
        role_id: "MainAgent",
        trace_id: "run-1",
      },
    ]);

    renderTimeline();

    expect(
      await screen.findByText("Subagent failed because the context limit was exceeded."),
    ).toBeVisible();
    expect(screen.queryByText(/A managed background task finished/)).not.toBeInTheDocument();
    expect(screen.queryByText(/background-task-notification/)).not.toBeInTheDocument();
    expect(screen.queryByText(/wait_background_task/)).not.toBeInTheDocument();
  });

  it("does not render protocol fallbacks for empty runtime message events", async () => {
    setRuntimeEntries([
      {
        eventId: 1,
        id: "run-message:1:0",
        kind: "message",
        occurredAt: "2026-06-23T00:00:00Z",
        payload: {},
        roleId: "user",
        runId: "run-message",
        sessionId: "session-1",
        text: "message",
      },
    ]);
    listSessionMessagesMock.mockResolvedValue([]);

    renderTimeline();

    expect(await screen.findByText("No messages yet")).toBeVisible();
    expect(screen.queryByText("message")).not.toBeInTheDocument();
    expect(screen.queryByText("User")).not.toBeInTheDocument();
  });

  it("does not render protocol placeholder text from replayed message payloads", async () => {
    setRuntimeEntries([
      {
        eventId: 1,
        id: "run-message:1:0",
        kind: "message",
        occurredAt: "2026-06-23T00:00:00Z",
        payload: { message: "message" },
        roleId: "user",
        runId: "run-message",
        sessionId: "session-1",
        text: "message",
      },
    ]);
    listSessionMessagesMock.mockResolvedValue([]);

    renderTimeline();

    expect(await screen.findByText("No messages yet")).toBeVisible();
    expect(screen.queryByText("message")).not.toBeInTheDocument();
    expect(screen.queryByText("User")).not.toBeInTheDocument();
  });

  it("renders runtime message payload content instead of the event type", async () => {
    setRuntimeEntries([
      {
        eventId: 1,
        id: "run-message:1:0",
        kind: "message",
        occurredAt: "2026-06-23T00:00:00Z",
        payload: {
          message: {
            parts: [{ kind: "text", text: "Actual replayed answer" }],
          },
        },
        roleId: "assistant",
        runId: "run-message",
        sessionId: "session-1",
        text: "message",
      },
    ]);
    listSessionMessagesMock.mockResolvedValue([]);

    renderTimeline();

    expect(await screen.findByText("Actual replayed answer")).toBeVisible();
    expect(screen.queryByText("message")).not.toBeInTheDocument();
    expect(screen.queryByText("Assistant")).not.toBeInTheDocument();
  });

  it("does not render empty thinking parts from runtime message payloads", async () => {
    setRuntimeStateFromEvents([
      relayRunEvent({
        event_id: 1,
        event_type: "message",
        payload_json: JSON.stringify({
          message: {
            parts: [
              { kind: "thinking", streaming: true, text: "" },
              { kind: "text", text: "Visible answer after empty thinking" },
            ],
          },
        }),
      }),
    ]);
    listSessionMessagesMock.mockResolvedValue([]);

    const { container } = renderTimeline();

    expect(await screen.findByText("Visible answer after empty thinking")).toBeVisible();
    expect(container.querySelector(".at-message-thinking")).toBeNull();
    expect(screen.queryByText("Thinking")).not.toBeInTheDocument();
  });

  it("keeps closed runtime output visible when only the user prompt is hydrated", async () => {
    setRuntimeEntries([
      runtimeTextDeltaEntry({
        eventId: 1,
        id: "run-output:1:0",
        text: "Closed runtime answer",
      }),
    ]);
    listSessionMessagesMock.mockResolvedValue([
      {
        content: "Original prompt",
        message_id: "user-run-output",
        role: "user",
        run_id: "run-output",
      },
    ]);

    renderTimeline();

    expect(await screen.findByText("Original prompt")).toBeVisible();
    expect(await screen.findByText("Closed runtime answer")).toBeVisible();
  });

  it("keeps closed runtime output visible when persisted assistant text is stale", async () => {
    setRuntimeEntries([
      runtimeTextDeltaEntry({
        eventId: 2,
        id: "run-output:2:0",
        text: "Fresh runtime answer after terminal event",
      }),
    ]);
    listSessionMessagesMock.mockResolvedValue([
      {
        content: "Older persisted answer for the same run",
        message_id: "assistant-run-output-stale",
        role_id: "MainAgent",
        run_id: "run-output",
      },
    ]);

    renderTimeline();

    expect(await screen.findByText("Older persisted answer for the same run"))
      .toBeVisible();
    expect(await screen.findByText("Fresh runtime answer after terminal event"))
      .toBeVisible();
  });

  it("hides closed runtime output once persisted assistant text covers it", async () => {
    const resumedText = "Resumed output after the hydrated cursor.";
    setRuntimeEntries([
      runtimeOutputDeltaEntry({
        eventId: 7,
        id: "run-output:7:0",
        payload: {
          output: [{ kind: "text", text: resumedText }],
        },
      }),
    ]);
    listSessionMessagesMock.mockResolvedValue([
      {
        message: {
          parts: [{ content: resumedText, part_kind: "text" }],
        },
        message_id: "assistant-run-output",
        role_id: "MainAgent",
        run_id: "run-output",
      },
    ]);

    renderTimeline();

    await waitForSingleVisibleText(resumedText);
  });

  it("drops terminal runtime prefixes once persisted assistant text covers the final answer", async () => {
    useRuntimeStore.setState({
      runtimeState: {
        activeRunIds: [],
        runs: {
          "run-prefix": {
            entries: [
              {
                eventId: 8,
                id: "run-prefix:8:0",
                kind: "text_delta",
                occurredAt: "2026-06-23T00:00:00Z",
                payload: { text: "Cra" },
                roleId: "MainAgent",
                runId: "run-prefix",
                sessionId: "session-1",
                text: "Cra",
              },
            ],
            hadVisibleTextStream: true,
            lastEventId: 9,
            runId: "run-prefix",
            seenEventKeys: [],
            status: "closed",
            terminalEventType: "run_completed",
          },
        },
      },
    });
    listSessionMessagesMock.mockResolvedValue([
      {
        content: "Crafter 子代理已完成。",
        message_id: "assistant-prefix-final",
        role_id: "MainAgent",
        run_id: "run-prefix",
      },
    ]);

    renderTimeline();

    expect(await screen.findByText("Crafter 子代理已完成。")).toBeVisible();
    expect(screen.queryByText("Cra")).not.toBeInTheDocument();
  });

  it("drops a persisted strict-prefix answer when the same run has its final answer", async () => {
    const prefix = "流式证据 SAMPLE。第一段仍在输出";
    const finalAnswer = `${prefix}，现在已经完整收敛。`;
    listSessionMessagesMock.mockResolvedValue([
      {
        content: prefix,
        message_id: "assistant-persisted-prefix",
        role_id: "MainAgent",
        run_id: "run-persisted-prefix",
      },
      {
        content: finalAnswer,
        message_id: "assistant-persisted-final",
        role_id: "MainAgent",
        run_id: "run-persisted-prefix",
      },
    ]);

    const { container } = renderTimeline();

    await waitFor(() => expect(screen.getByText(finalAnswer)).toBeVisible());
    expect(screen.queryByText(prefix, { exact: true })).not.toBeInTheDocument();
    expect(container.querySelectorAll("article.at-message")).toHaveLength(1);
  });

  it("drops a pre-work streamed prefix after processed grouping exposes the final text", async () => {
    const prefix = "流式证据 SAMPLE。实时文本仍在拼接";
    const finalAnswer = `${prefix}，现在已经完整收敛。`;
    listSessionMessagesMock.mockResolvedValue([
      {
        message: {
          parts: [
            { content: prefix, part_kind: "text" },
            { content: "Checking terminal hydration", part_kind: "thinking" },
            { content: finalAnswer, part_kind: "text" },
          ],
        },
        message_id: "assistant-processed-prefix-final",
        role_id: "MainAgent",
        run_id: "run-processed-prefix-final",
      },
    ]);
    listSessionRoundsMock.mockResolvedValue({
      has_more: false,
      items: [
        {
          created_at: "2026-06-23T12:42:33Z",
          run_id: "run-processed-prefix-final",
          run_status: "completed",
          run_user_message: "Processed prefix closure",
        },
      ],
      next_cursor: null,
    });

    const { container } = renderTimeline();

    await waitFor(() => expect(screen.getByText(finalAnswer)).toBeVisible());
    expect(screen.queryByText(prefix, { exact: true })).not.toBeInTheDocument();
    expect(container.querySelectorAll("article.at-message")).toHaveLength(1);
    expect(container.querySelector("details.at-processed-group")).not.toBeNull();
  });

  it("keeps prefix-related answers when both rows belong to different runs", async () => {
    const runtimePrefix = "共享开头仍属于新的运行";
    const historicalAnswer = `${runtimePrefix}，这是旧运行的完整历史回答。`;
    useRuntimeStore.setState({
      runtimeState: {
        activeRunIds: ["run-new-prefix"],
        runs: {
          "run-new-prefix": {
            entries: [
              {
                eventId: 1,
                id: "run-new-prefix:1:0",
                kind: "text_delta",
                occurredAt: "2026-06-23T00:00:00Z",
                payload: { text: runtimePrefix },
                roleId: "MainAgent",
                runId: "run-new-prefix",
                sessionId: "session-1",
                text: runtimePrefix,
              },
            ],
            hadVisibleTextStream: true,
            lastEventId: 1,
            runId: "run-new-prefix",
            seenEventKeys: [],
            status: "open",
            terminalEventType: null,
          },
        },
      },
    });
    listSessionMessagesMock.mockResolvedValue([
      {
        content: historicalAnswer,
        message_id: "assistant-old-prefix-answer",
        role_id: "MainAgent",
        run_id: "run-old-prefix",
      },
    ]);

    renderTimeline();

    expect(await screen.findByText(historicalAnswer)).toBeVisible();
    expect(screen.getByText(runtimePrefix, { exact: true })).toBeVisible();
  });

  it("renders one answer when persisted text upgrades a terminal runtime reveal", async () => {
    useRuntimeStore.setState({
      runtimeState: {
        activeRunIds: [],
        runs: {
          "run-reveal-upgrade": {
            entries: [
              {
                eventId: 8,
                id: "run-reveal-upgrade:8:0",
                kind: "text_delta",
                occurredAt: "2026-06-23T00:00:00Z",
                payload: { text: "LIVE_STRE" },
                roleId: "MainAgent",
                runId: "run-reveal-upgrade",
                sessionId: "session-1",
                text: "LIVE_STRE",
              },
              {
                eventId: 9,
                id: "run-reveal-upgrade:9:1",
                kind: "run_completed",
                occurredAt: "2026-06-23T00:00:01Z",
                payload: { status: "completed" },
                roleId: "MainAgent",
                runId: "run-reveal-upgrade",
                sessionId: "session-1",
                text: "completed",
              },
            ],
            hadVisibleTextStream: true,
            lastEventId: 9,
            runId: "run-reveal-upgrade",
            seenEventKeys: [],
            status: "closed",
            terminalEventType: "run_completed",
          },
        },
      },
    });
    listSessionMessagesMock.mockResolvedValue([
      {
        content: "LIVE_STREAM_ALPHA LIVE_STREAM_BETA LIVE_STREAM_KAPPA",
        message_id: "assistant-reveal-upgrade-final",
        role_id: "MainAgent",
        run_id: "run-reveal-upgrade",
      },
    ]);

    const { container } = renderTimeline();

    expect(
      await screen.findByText("LIVE_STREAM_ALPHA LIVE_STREAM_BETA LIVE_STREAM_KAPPA"),
    ).toBeVisible();
    expect(screen.queryByText("LIVE_STRE")).not.toBeInTheDocument();
    await waitFor(() => {
      expect(container.querySelectorAll("article.at-message")).toHaveLength(1);
    });
    const messageRow = container.querySelector<HTMLElement>("article.at-message");
    expect(messageRow?.dataset.rowKey).toBe(
      "runtime-text:run-reveal-upgrade:MainAgent:0",
    );
    expect(messageRow?.dataset.rowKey).not.toBe("message:assistant-reveal-upgrade-final");
  });

  it("keeps the runtime row mounted when terminal hydration replaces an active stream", async () => {
    const finalAnswer = [
      "LIVE_STREAM_ALPHA",
      "LIVE_STREAM_BETA",
      "LIVE_STREAM_GAMMA",
      "LIVE_STREAM_DELTA",
    ].join(" ");
    const streamEntry: TimelineEntry = {
      eventId: 8,
      id: "run-live-hydrate:8:0",
      kind: "text_delta",
      occurredAt: "2026-06-23T00:00:00Z",
      payload: { text: finalAnswer },
      roleId: "MainAgent",
      runId: "run-live-hydrate",
      sessionId: "session-1",
      text: finalAnswer,
    };
    useRuntimeStore.setState({
      runtimeState: {
        activeRunIds: ["run-live-hydrate"],
        runs: {
          "run-live-hydrate": {
            entries: [streamEntry],
            hadVisibleTextStream: true,
            lastEventId: 8,
            runId: "run-live-hydrate",
            seenEventKeys: [],
            status: "open",
            terminalEventType: null,
          },
        },
      },
    });
    listSessionMessagesMock.mockResolvedValue([]);

    const { container, queryClient } = renderTimeline();

    expect(await screen.findByText(finalAnswer, {}, { timeout: 3_000 })).toBeVisible();
    const rowBefore = container.querySelector<HTMLElement>("article.at-message");
    expect(rowBefore).not.toBeNull();
    expect(rowBefore?.dataset.rowKey).toBe(
      "runtime-text:run-live-hydrate:MainAgent:0",
    );

    act(() => {
      queryClient.setQueryData(["sessions", "session-1", "messages"], [
        {
          content: finalAnswer,
          message_id: "assistant-live-hydrate-final",
          role_id: "MainAgent",
          run_id: "run-live-hydrate",
        },
      ]);
      useRuntimeStore.setState({
        runtimeState: {
          activeRunIds: [],
          runs: {
            "run-live-hydrate": {
              entries: [
                streamEntry,
                {
                  eventId: 9,
                  id: "run-live-hydrate:9:1",
                  kind: "run_completed",
                  occurredAt: "2026-06-23T00:00:01Z",
                  payload: { status: "completed" },
                  roleId: "MainAgent",
                  runId: "run-live-hydrate",
                  sessionId: "session-1",
                  text: "completed",
                },
              ],
              hadVisibleTextStream: true,
              lastEventId: 9,
              runId: "run-live-hydrate",
              seenEventKeys: [],
              status: "closed",
              targetRoleId: "MainAgent",
              terminalEventType: "run_completed",
            },
          },
        },
      });
    });

    await waitFor(() => expect(screen.getByText(finalAnswer)).toBeVisible(), {
      timeout: 3000,
    });
    const rowAfter = container.querySelector<HTMLElement>("article.at-message");
    expect(rowAfter).toBe(rowBefore);
    expect(rowAfter?.dataset.rowKey).toBe(
      "runtime-text:run-live-hydrate:MainAgent:0",
    );
    expect(rowAfter).not.toHaveClass("is-streaming");
    expect(container.querySelectorAll(".streaming-cursor")).toHaveLength(0);
  });

  it("does not replay runtime text after the persisted answer is already visible", async () => {
    vi.stubEnv("MODE", "production");
    const finalAnswer = [
      "LIVE_STREAM_ALPHA",
      "LIVE_STREAM_BETA",
      "LIVE_STREAM_GAMMA",
      "LIVE_STREAM_DELTA",
      "LIVE_STREAM_EPSILON",
      "LIVE_STREAM_ZETA",
      "LIVE_STREAM_ETA",
      "LIVE_STREAM_THETA",
      "LIVE_STREAM_IOTA",
      "LIVE_STREAM_KAPPA",
    ].join(" ");
    const runId = "run-persisted-before-live-replay";
    listSessionMessagesMock.mockResolvedValue([
      {
        content: finalAnswer,
        message_id: "assistant-persisted-before-live-replay",
        role_id: "MainAgent",
        run_id: runId,
      },
    ]);

    const { container } = renderTimeline();

    expect(await screen.findByText(finalAnswer)).toBeVisible();
    const rowBeforeReplay = container.querySelector<HTMLElement>("article.at-message");
    const textBeforeReplay = container.querySelector<HTMLElement>(".at-message-text");
    expect(rowBeforeReplay).not.toBeNull();
    expect(textBeforeReplay).not.toBeNull();
    expect(rowBeforeReplay).not.toHaveClass("is-streaming");
    expect(container.querySelector(".at-message-streaming-text")).toBeNull();
    expect(container.querySelectorAll(".streaming-cursor")).toHaveLength(0);

    act(() => {
      useRuntimeStore.setState({
        runtimeState: {
          activeRunIds: [runId],
          runs: {
            [runId]: {
              entries: [
                {
                  eventId: 8,
                  id: `${runId}:8:0`,
                  kind: "text_delta",
                  occurredAt: "2026-06-23T00:00:00Z",
                  payload: { text: finalAnswer },
                  roleId: "MainAgent",
                  runId,
                  sessionId: "session-1",
                  text: finalAnswer,
                },
              ],
              hadVisibleTextStream: true,
              lastEventId: 8,
              runId,
              seenEventKeys: [],
              status: "open",
              terminalEventType: null,
            },
          },
        },
      });
    });

    const rowAfterReplay = container.querySelector<HTMLElement>("article.at-message");
    const textAfterReplay = container.querySelector<HTMLElement>(".at-message-text");
    expect(rowAfterReplay?.dataset.rowKey).toBe(
      "runtime-text:run-persisted-before-live-replay:MainAgent:0",
    );
    expect(rowAfterReplay).toHaveClass("is-streaming");
    expect(textAfterReplay).not.toBeNull();
    expect(textAfterReplay).toHaveClass("at-message-streaming-text");
    expect(textAfterReplay).toHaveTextContent(finalAnswer);
    expect(textAfterReplay?.textContent).toBe(finalAnswer);
    expect(container.querySelectorAll(".streaming-cursor")).toHaveLength(1);
    expect(container.querySelectorAll("article.at-message")).toHaveLength(1);

    act(() => {
      useRuntimeStore.setState({
        runtimeState: {
          activeRunIds: [],
          runs: {
            [runId]: {
              entries: [
                {
                  eventId: 8,
                  id: `${runId}:8:0`,
                  kind: "text_delta",
                  occurredAt: "2026-06-23T00:00:00Z",
                  payload: { text: finalAnswer },
                  roleId: "MainAgent",
                  runId,
                  sessionId: "session-1",
                  text: finalAnswer,
                },
                {
                  eventId: 9,
                  id: `${runId}:9:1`,
                  kind: "run_completed",
                  occurredAt: "2026-06-23T00:00:01Z",
                  payload: { status: "completed" },
                  roleId: "MainAgent",
                  runId,
                  sessionId: "session-1",
                  text: "completed",
                },
              ],
              hadVisibleTextStream: true,
              lastEventId: 9,
              runId,
              seenEventKeys: [],
              status: "closed",
              targetRoleId: "MainAgent",
              terminalEventType: "run_completed",
            },
          },
        },
      });
    });

    const rowAfterCompleted = container.querySelector<HTMLElement>("article.at-message");
    expect(rowAfterCompleted?.dataset.rowKey).toBe(
      "runtime-text:run-persisted-before-live-replay:MainAgent:0",
    );
    expect(rowAfterCompleted).not.toHaveClass("is-streaming");
    expect(screen.getByText(finalAnswer)).toBeVisible();
    expect(container.querySelector(".at-message-streaming-text")).toBeNull();
    expect(container.querySelectorAll(".streaming-cursor")).toHaveLength(0);
  });

  it("keeps MainAgent live answer text outside the processed group", async () => {
    const finalAnswer = "LIVE_MAIN_AGENT_ALPHA LIVE_MAIN_AGENT_BETA";
    setRuntimeStateFromEvents([
      relayRunEvent({
        event_id: 1,
        event_type: "thinking_started",
        payload_json: "{}",
        run_id: "run-mainagent-live",
        trace_id: "run-mainagent-live",
      }),
      relayRunEvent({
        event_id: 2,
        event_type: "thinking_delta",
        payload_json: JSON.stringify({ text: "I will answer directly." }),
        run_id: "run-mainagent-live",
        trace_id: "run-mainagent-live",
      }),
      relayRunEvent({
        event_id: 3,
        event_type: "text_delta",
        payload_json: JSON.stringify({ text: finalAnswer }),
        run_id: "run-mainagent-live",
        trace_id: "run-mainagent-live",
      }),
    ]);
    listSessionMessagesMock.mockResolvedValue([]);

    const { container } = renderTimeline();

    expect(await screen.findByText(finalAnswer)).toBeVisible();
    const streamingText = container.querySelector<HTMLElement>(
      ".at-message-streaming-text",
    );
    expect(streamingText).not.toBeNull();
    expect(streamingText?.closest("details.at-processed-group")).toBeNull();
  });

  it("keeps public user content visible even when it resembles an internal notification", async () => {
    listSessionMessagesMock.mockResolvedValue([{
      content: "A managed background task finished. <background-task-notification>",
      message_id: "public-user-message",
      role: "user",
      visibility: "public",
    }]);

    renderTimeline();

    expect(await screen.findByText(
      "A managed background task finished. <background-task-notification>",
    )).toBeVisible();
  });

  it("keeps the live processed tree and scroll anchor stable at terminal", async () => {
    const runId = "run-stable-processed-terminal";
    const storageWrite = vi.spyOn(Storage.prototype, "setItem");
    const liveEvents: RelayRunEvent[] = [
      relayRunEvent({
        event_id: 1,
        event_type: "thinking_started",
        payload_json: JSON.stringify({ part_index: 0 }),
        run_id: runId,
        trace_id: runId,
      }),
      relayRunEvent({
        event_id: 2,
        event_type: "thinking_delta",
        payload_json: JSON.stringify({ part_index: 0, text: "Stable thought" }),
        run_id: runId,
        trace_id: runId,
      }),
      relayRunEvent({
        event_id: 3,
        event_type: "text_delta",
        payload_json: JSON.stringify({ text: "Stable answer" }),
        run_id: runId,
        trace_id: runId,
      }),
    ];
    setRuntimeStateFromEvents(liveEvents);
    listSessionMessagesMock.mockResolvedValue([]);
    const { container, queryClient } = renderTimeline();

    const rowsBefore = await waitFor(() => {
      const elements = Array.from(container.querySelectorAll<HTMLElement>(
        `article.at-message[data-run-id="${runId}"][data-row-key]`,
      ));
      expect(elements.length).toBeGreaterThan(0);
      return elements;
    });
    const groupBefore = container.querySelector<HTMLElement>(
      `[data-row-key="processed:${runId}"]`,
    );
    expect(groupBefore).not.toBeNull();
    expect(groupBefore?.querySelector("details.at-processed-group")).toHaveAttribute("open");
    const thinkingBefore = groupBefore?.querySelector("details.at-message-thinking") ?? null;
    expect(thinkingBefore).not.toBeNull();
    const answerBefore = container.querySelector<HTMLElement>(
      `[data-row-key="runtime-text:${runId}:MainAgent:0"]`,
    );
    expect(answerBefore).not.toBeNull();
    expect(answerBefore?.closest("details.at-processed-group")).toBeNull();
    expect(groupBefore).not.toHaveTextContent("Stable answer");
    expect(screen.getAllByText("Stable answer")).toHaveLength(1);
    const rowKeysBefore = rowsBefore.map((element) => element.dataset.rowKey ?? "");
    expect(new Set(rowKeysBefore).size).toBe(rowKeysBefore.length);
    storageWrite.mockClear();
    const pressureEvents = [...liveEvents];
    for (let eventId = 4; eventId < 104; eventId += 1) {
      pressureEvents.push(relayRunEvent({
        event_id: eventId,
        event_type: "thinking_delta",
        payload_json: JSON.stringify({ part_index: 0, text: ` ${eventId}` }),
        run_id: runId,
        trace_id: runId,
      }));
      act(() => setRuntimeStateFromEvents(pressureEvents));
    }
    expect(storageWrite.mock.calls.filter(
      ([key]) => key === "agentTeams.liveProcessedRuns",
    ).length).toBeLessThanOrEqual(1);
    const timeline = container.querySelector<HTMLElement>(".at-timeline");
    if (timeline === null) {
      throw new Error("Timeline scroll owner was not rendered.");
    }
    Object.defineProperty(timeline, "clientHeight", { configurable: true, value: 200 });
    Object.defineProperty(timeline, "scrollHeight", { configurable: true, value: 1000 });
    timeline.scrollTop = 120;
    fireEvent.scroll(timeline);

    act(() => {
      setRuntimeStateFromEvents([
        ...pressureEvents,
        relayRunEvent({
          event_id: 104,
          event_type: "run_completed",
          payload_json: JSON.stringify({ output: "Stable answer" }),
          run_id: runId,
          trace_id: runId,
        }),
      ]);
    });

    await waitFor(() => {
      const rowsAfter = Array.from(container.querySelectorAll<HTMLElement>(
        `article.at-message[data-run-id="${runId}"][data-row-key]`,
      ));
      expect(rowsAfter.map((element) => element.dataset.rowKey ?? ""))
        .toEqual(rowKeysBefore);
      expect(rowsAfter).toEqual(rowsBefore);
    });
    expect(container.querySelector(`[data-row-key="processed:${runId}"]`))
      .toBe(groupBefore);
    expect(container.querySelector(
      `[data-row-key="runtime-text:${runId}:MainAgent:0"]`,
    )).toBe(answerBefore);
    expect(groupBefore).not.toHaveTextContent("Stable answer");
    expect(screen.getAllByText("Stable answer")).toHaveLength(1);
    expect(timeline.scrollTop).toBe(120);

    act(() => {
      queryClient.setQueryData(["sessions", "session-1", "messages"], [
        {
          content: "Stable answer",
          message_id: "assistant-stable-processed-terminal",
          role_id: "MainAgent",
          run_id: runId,
        },
      ]);
    });

    await waitFor(() => {
      expect(container.querySelector(`[data-row-key="processed:${runId}"]`))
        .toBe(groupBefore);
      expect(container.querySelector(
        `[data-row-key="runtime-text:${runId}:MainAgent:0"]`,
      )).toBe(answerBefore);
      expect(groupBefore?.querySelector("details.at-message-thinking"))
        .toBe(thinkingBefore);
      expect(screen.getAllByText("Stable answer")).toHaveLength(1);
    });
    expect(groupBefore).not.toHaveTextContent("Stable answer");
    expect(timeline.scrollTop).toBe(120);
  });

  it("preserves event order when narration separates two live tool calls", async () => {
    const runId = "run-interleaved-live-work";
    const liveEvents = [
      relayRunEvent({
        event_id: 1,
        event_type: "thinking_delta",
        payload_json: JSON.stringify({ text: "Plan first tool" }),
        run_id: runId,
        trace_id: runId,
      }),
      relayRunEvent({
        event_id: 2,
        event_type: "tool_call",
        payload_json: JSON.stringify({
          args: { command: "echo first" },
          tool_call_id: "call-first",
          action_family: "run",
          semantic_category: "execution",
          tool_name: "shell",
        }),
        run_id: runId,
        trace_id: runId,
      }),
      relayRunEvent({
        event_id: 3,
        event_type: "tool_result",
        payload_json: JSON.stringify({
          result: { output: "first" },
          tool_call_id: "call-first",
          action_family: "run",
          semantic_category: "execution",
          tool_name: "shell",
        }),
        run_id: runId,
        trace_id: runId,
      }),
      relayRunEvent({
        event_id: 4,
        event_type: "text_delta",
        payload_json: JSON.stringify({ text: "Intermediate narration" }),
        run_id: runId,
        trace_id: runId,
      }),
      relayRunEvent({
        event_id: 5,
        event_type: "tool_call",
        payload_json: JSON.stringify({
          args: { path: "frontend/app" },
          tool_call_id: "call-second",
          action_family: "read",
          semantic_category: "file-read",
          tool_name: "read",
        }),
        run_id: runId,
        trace_id: runId,
      }),
      relayRunEvent({
        event_id: 6,
        event_type: "tool_result",
        payload_json: JSON.stringify({
          result: { output: "second" },
          tool_call_id: "call-second",
          action_family: "read",
          semantic_category: "file-read",
          tool_name: "read",
        }),
        run_id: runId,
        trace_id: runId,
      }),
      relayRunEvent({
        event_id: 7,
        event_type: "text_delta",
        payload_json: JSON.stringify({ text: "Final answer" }),
        run_id: runId,
        trace_id: runId,
      }),
    ];
    setRuntimeStateFromEvents(liveEvents);
    listSessionMessagesMock.mockResolvedValue([]);
    const { container } = renderTimeline();

    await screen.findByText("Final answer");
    const group = container.querySelector<HTMLElement>(
      `[data-row-key="processed:${runId}"]`,
    );
    const narration = screen.getByText("Intermediate narration").closest("article");
    const secondTool = container.querySelector('[data-tool-call-id="call-second"]')
      ?.closest("article");
    const finalAnswer = screen.getByText("Final answer").closest("article");
    if (
      group === null ||
      narration === null ||
      secondTool === null ||
      secondTool === undefined ||
      finalAnswer === null
    ) {
      throw new Error("Interleaved live rows were not all rendered.");
    }
    expect(group.compareDocumentPosition(narration) & Node.DOCUMENT_POSITION_FOLLOWING)
      .toBeTruthy();
    expect(narration.compareDocumentPosition(secondTool) & Node.DOCUMENT_POSITION_FOLLOWING)
      .toBeTruthy();
    expect(secondTool.compareDocumentPosition(finalAnswer) & Node.DOCUMENT_POSITION_FOLLOWING)
      .toBeTruthy();
    const rowKeys = Array.from(container.querySelectorAll<HTMLElement>("[data-row-key]"))
      .map((row) => row.dataset.rowKey ?? "");
    expect(new Set(rowKeys).size).toBe(rowKeys.length);

    act(() => {
      setRuntimeStateFromEvents([
        ...liveEvents,
        relayRunEvent({
          event_id: 8,
          event_type: "run_completed",
          payload_json: JSON.stringify({ output: "Final answer" }),
          run_id: runId,
          trace_id: runId,
        }),
      ]);
    });

    await waitFor(() => {
      expect(container.querySelector(`[data-row-key="processed:${runId}"]`)).toBe(group);
      expect(screen.getByText("Intermediate narration").closest("article"))
        .toBe(narration);
      expect(container.querySelector('[data-tool-call-id="call-second"]')?.closest("article"))
        .toBe(secondTool);
      expect(screen.getByText("Final answer").closest("article")).toBe(finalAnswer);
    });
    expect(screen.getAllByText("Final answer")).toHaveLength(1);
  });

  it("keeps multi-run answer rows equivalent when the latest terminal run hydrates", async () => {
    const events = [
      relayRunEvent({
        event_id: 1,
        event_type: "text_delta",
        payload_json: JSON.stringify({ text: "FIRST_RUN_FINAL" }),
        run_id: "run-first-hydrated",
        trace_id: "run-first-hydrated",
      }),
      relayRunEvent({
        event_id: 2,
        event_type: "run_completed",
        payload_json: JSON.stringify({ output: "FIRST_RUN_FINAL" }),
        run_id: "run-first-hydrated",
        trace_id: "run-first-hydrated",
      }),
      relayRunEvent({
        event_id: 1,
        event_type: "text_delta",
        payload_json: JSON.stringify({ text: "SECOND_RUN_FINAL" }),
        run_id: "run-second-live",
        trace_id: "run-second-live",
      }),
    ];
    setRuntimeStateFromEvents(events);
    listSessionMessagesMock.mockResolvedValue([
      {
        content: "FIRST_RUN_FINAL",
        message_id: "message-first-hydrated",
        role_id: "MainAgent",
        run_id: "run-first-hydrated",
      },
    ]);
    const { container, queryClient } = renderTimeline();
    expect(await screen.findByText("FIRST_RUN_FINAL")).toBeVisible();
    expect(await screen.findByText("SECOND_RUN_FINAL")).toBeVisible();
    const before = answerRowSequence(container, ["FIRST_RUN_FINAL", "SECOND_RUN_FINAL"]);

    act(() => setRuntimeStateFromEvents([
      ...events,
      relayRunEvent({
        event_id: 2,
        event_type: "run_completed",
        payload_json: JSON.stringify({ output: "SECOND_RUN_FINAL" }),
        run_id: "run-second-live",
        trace_id: "run-second-live",
      }),
    ]));
    act(() => {
      queryClient.setQueryData(["sessions", "session-1", "messages"], [
        {
          content: "FIRST_RUN_FINAL",
          message_id: "message-first-hydrated",
          role_id: "MainAgent",
          run_id: "run-first-hydrated",
        },
        {
          content: "SECOND_RUN_FINAL",
          message_id: "message-second-hydrated",
          role_id: "MainAgent",
          run_id: "run-second-live",
        },
      ]);
    });

    await waitFor(() => {
      expect(answerRowSequence(
        container,
        ["FIRST_RUN_FINAL", "SECOND_RUN_FINAL"],
      )).toEqual(before);
    });
  });

  it("does not type the terminal hydrated answer a second time after stream close", async () => {
    vi.stubEnv("MODE", "production");
    vi.useFakeTimers();
    const streamedPrefix = "LI";
    const finalAnswer = [
      streamedPrefix,
      "LIVE_STREAM_ALPHA",
      "LIVE_STREAM_BETA",
      "LIVE_STREAM_GAMMA",
      "LIVE_STREAM_DELTA",
      "LIVE_STREAM_EPSILON",
    ].join(" ");
    const streamEntry: TimelineEntry = {
      eventId: 8,
      id: "run-live-terminal-no-replay:8:0",
      kind: "text_delta",
      occurredAt: "2026-06-23T00:00:00Z",
      payload: { text: streamedPrefix },
      roleId: "MainAgent",
      runId: "run-live-terminal-no-replay",
      sessionId: "session-1",
      text: streamedPrefix,
    };
    useRuntimeStore.setState({
      runtimeState: {
        activeRunIds: ["run-live-terminal-no-replay"],
        runs: {
          "run-live-terminal-no-replay": {
            entries: [streamEntry],
            hadVisibleTextStream: true,
            lastEventId: 8,
            runId: "run-live-terminal-no-replay",
            seenEventKeys: [],
            status: "open",
            terminalEventType: null,
          },
        },
      },
    });
    listSessionMessagesMock.mockResolvedValue([]);

    const { container, queryClient } = renderTimeline();

    const streamingText = container.querySelector<HTMLElement>(
      ".at-message-streaming-text",
    );
    expect(streamingText).not.toBeNull();
    expect(streamingText).toHaveTextContent("L");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(screen.getByText(streamedPrefix)).toBeVisible();

    await act(async () => {
      queryClient.setQueryData(["sessions", "session-1", "messages"], [
        {
          content: finalAnswer,
          message_id: "assistant-live-terminal-no-replay-final",
          role_id: "MainAgent",
          run_id: "run-live-terminal-no-replay",
        },
      ]);
      useRuntimeStore.setState({
        runtimeState: {
          activeRunIds: [],
          runs: {
            "run-live-terminal-no-replay": {
              entries: [
                streamEntry,
                {
                  eventId: 9,
                  id: "run-live-terminal-no-replay:9:1",
                  kind: "run_completed",
                  occurredAt: "2026-06-23T00:00:01Z",
                  payload: { status: "completed" },
                  roleId: "MainAgent",
                  runId: "run-live-terminal-no-replay",
                  sessionId: "session-1",
                  text: "completed",
                },
              ],
              hadVisibleTextStream: true,
              lastEventId: 9,
              runId: "run-live-terminal-no-replay",
              seenEventKeys: [],
              status: "closed",
              terminalEventType: "run_completed",
            },
          },
        },
      });
    });

    expect(screen.getByText(finalAnswer)).toBeVisible();
    expect(screen.queryByText(streamedPrefix)).not.toBeInTheDocument();
    expect(container.querySelector(".at-message-streaming-text")).toBeNull();
    expect(container.querySelectorAll(".streaming-cursor")).toHaveLength(0);
    expect(container.querySelectorAll("article.at-message")).toHaveLength(1);
  });

  it("renders received live runtime text without synthetic replay", async () => {
    const finalAnswer = [
      "LIVE_STREAM_ALPHA",
      "LIVE_STREAM_BETA",
      "LIVE_STREAM_GAMMA",
      "LIVE_STREAM_DELTA",
      "LIVE_STREAM_EPSILON",
    ].join(" ");
    setRuntimeStateFromEvents([
      relayRunEvent({
        event_id: 1,
        event_type: "text_delta",
        payload_json: JSON.stringify({ text: finalAnswer }),
        run_id: "run-live-progressive-text",
        trace_id: "run-live-progressive-text",
      }),
    ]);
    listSessionMessagesMock.mockResolvedValue([]);

    const { container } = renderTimeline();

    const streamingText = container.querySelector<HTMLElement>(
      ".at-message-streaming-text",
    );
    expect(streamingText).not.toBeNull();
    expect(streamingText).toHaveTextContent(finalAnswer);
    expect(container.querySelectorAll(".streaming-cursor")).toHaveLength(1);
    expect(screen.getByText(finalAnswer)).toBeVisible();
  });

  it("keeps a fully received live row mounted when terminal output arrives", async () => {
    vi.stubEnv("MODE", "production");
    vi.useFakeTimers();
    const finalAnswer = [
      "LIVE_STREAM_ALPHA",
      "LIVE_STREAM_BETA",
      "LIVE_STREAM_GAMMA",
      "LIVE_STREAM_DELTA",
    ].join(" ");
    const textEvent = relayRunEvent({
      event_id: 1,
      event_type: "text_delta",
      payload_json: JSON.stringify({ text: finalAnswer }),
      run_id: "run-live-terminal-mounted",
      trace_id: "run-live-terminal-mounted",
    });
    setRuntimeStateFromEvents([textEvent]);
    listSessionMessagesMock.mockResolvedValue([]);

    const { container } = renderTimeline();

    for (let frame = 0; frame < 120; frame += 1) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(36);
      });
    }
    expect(screen.getByText(finalAnswer)).toBeVisible();
    const rowBefore = container.querySelector<HTMLElement>("article.at-message");
    const textNodeBefore = container.querySelector<HTMLElement>(".at-message-text");
    expect(rowBefore).not.toBeNull();
    expect(textNodeBefore).not.toBeNull();
    expect(textNodeBefore).toHaveClass("at-message-streaming-text");

    await act(async () => {
      setRuntimeStateFromEvents([
        textEvent,
        relayRunEvent({
          event_id: 2,
          event_type: "run_completed",
          payload_json: JSON.stringify({
            output: [{ kind: "text", text: finalAnswer }],
            status: "completed",
          }),
          run_id: "run-live-terminal-mounted",
          trace_id: "run-live-terminal-mounted",
        }),
      ]);
    });

    const rowAfter = container.querySelector<HTMLElement>("article.at-message");
    const textNodeAfter = container.querySelector<HTMLElement>(".at-message-text");
    expect(rowAfter).toBe(rowBefore);
    expect(textNodeAfter).toBe(textNodeBefore);
    expect(textNodeAfter).not.toHaveClass("at-message-streaming-text");
    expect(screen.getByText(finalAnswer)).toBeVisible();
    expect(container.querySelector(".at-message-streaming-text")).toBeNull();
    expect(container.querySelectorAll(".streaming-cursor")).toHaveLength(0);
    expect(container.querySelectorAll("article.at-message")).toHaveLength(1);
  });

  it("keeps the text row mounted and parses markdown only after streaming settles", async () => {
    const finalAnswer = [
      "LIVE_STREAM_ALPHA",
      "LIVE_STREAM_BETA",
      "LIVE_STREAM_GAMMA",
      "LIVE_STREAM_DELTA",
    ].join(" ");
    const textEvent = relayRunEvent({
      event_id: 1,
      event_type: "text_delta",
      payload_json: JSON.stringify({ text: finalAnswer }),
      run_id: "run-live-markdown-node-stable",
      trace_id: "run-live-markdown-node-stable",
    });
    setRuntimeStateFromEvents([textEvent]);
    listSessionMessagesMock.mockResolvedValue([]);

    const { container } = renderTimeline();

    expect(await screen.findByText(finalAnswer)).toBeVisible();
    const rowBefore = container.querySelector<HTMLElement>("article.at-message");
    const textNodeBefore = container.querySelector<HTMLElement>(".at-message-text");
    const markdownBefore = container.querySelector<HTMLElement>(".at-message-markdown");
    expect(rowBefore).not.toBeNull();
    expect(textNodeBefore).not.toBeNull();
    expect(markdownBefore).not.toBeNull();
    expect(textNodeBefore).toHaveClass("at-message-streaming-text");
    expect(container.querySelectorAll(".streaming-cursor")).toHaveLength(1);

    await act(async () => {
      setRuntimeStateFromEvents([
        textEvent,
        relayRunEvent({
          event_id: 2,
          event_type: "run_completed",
          payload_json: JSON.stringify({ status: "completed" }),
          run_id: "run-live-markdown-node-stable",
          trace_id: "run-live-markdown-node-stable",
        }),
      ]);
    });

    expect(container.querySelector<HTMLElement>("article.at-message")).toBe(rowBefore);
    expect(container.querySelector<HTMLElement>(".at-message-text"))
      .toBe(textNodeBefore);
    const markdownAfter = container.querySelector<HTMLElement>(".at-message-markdown");
    expect(markdownAfter).toBe(markdownBefore);
    expect(markdownAfter?.querySelector("p")).toBe(
      markdownBefore?.querySelector("p"),
    );
    expect(markdownAfter?.querySelector("p")).toHaveTextContent(finalAnswer);
    expect(textNodeBefore).not.toHaveClass("at-message-streaming-text");
    expect(container.querySelectorAll(".streaming-cursor")).toHaveLength(0);
    expect(screen.getByText(finalAnswer)).toBeVisible();
  });

  it("does not re-render a completed runtime text segment after the full delta arrives", async () => {
    vi.stubEnv("MODE", "production");
    vi.useFakeTimers();
    const finalAnswer = [
      "LIVE_STREAM_ALPHA",
      "LIVE_STREAM_BETA",
      "LIVE_STREAM_GAMMA",
      "LIVE_STREAM_DELTA",
      "LIVE_STREAM_EPSILON",
    ].join(" ");
    const textEvent = relayRunEvent({
      event_id: 1,
      event_type: "text_delta",
      payload_json: JSON.stringify({ text: finalAnswer }),
      run_id: "run-live-terminal-no-fake-type",
      trace_id: "run-live-terminal-no-fake-type",
    });
    setRuntimeStateFromEvents([textEvent]);
    listSessionMessagesMock.mockResolvedValue([]);

    const { container } = renderTimeline();

    await act(async () => {
      vi.advanceTimersByTime(2_000);
    });

    expect(container.querySelector(".at-message-streaming-text"))
      .toHaveTextContent(finalAnswer);
    expect(screen.getByText(finalAnswer)).toBeVisible();
    const rowBefore = container.querySelector<HTMLElement>("article.at-message");
    const textNodeBefore = container.querySelector<HTMLElement>(".at-message-text");

    await act(async () => {
      setRuntimeStateFromEvents([
        textEvent,
        relayRunEvent({
          event_id: 2,
          event_type: "run_completed",
          payload_json: JSON.stringify({ status: "completed" }),
          run_id: "run-live-terminal-no-fake-type",
          trace_id: "run-live-terminal-no-fake-type",
        }),
      ]);
    });

    expect(screen.getByText(finalAnswer)).toBeVisible();
    expect(container.querySelector<HTMLElement>("article.at-message")).toBe(rowBefore);
    expect(container.querySelector<HTMLElement>(".at-message-text")).toBe(textNodeBefore);
    expect(container.querySelector(".at-message-streaming-text")).toBeNull();
    expect(container.querySelectorAll(".streaming-cursor")).toHaveLength(0);
    expect(container.querySelectorAll("article.at-message")).toHaveLength(1);
  });

  it("does not replay terminal output after it fills and history catches up", async () => {
    vi.stubEnv("MODE", "production");
    vi.useFakeTimers();
    const streamedPrefix = "LI";
    const finalAnswer = [
      streamedPrefix,
      "LIVE_STREAM_ALPHA",
      "LIVE_STREAM_BETA",
      "LIVE_STREAM_GAMMA",
      "LIVE_STREAM_DELTA",
      "LIVE_STREAM_EPSILON",
    ].join(" ");
    const prefixEvent = relayRunEvent({
      event_id: 1,
      event_type: "text_delta",
      payload_json: JSON.stringify({ text: streamedPrefix }),
      run_id: "run-live-terminal-history-catchup",
      trace_id: "run-live-terminal-history-catchup",
    });
    const completedEvent = relayRunEvent({
      event_id: 2,
      event_type: "run_completed",
      payload_json: JSON.stringify({
        output: [{ kind: "text", text: finalAnswer }],
        status: "completed",
      }),
      run_id: "run-live-terminal-history-catchup",
      trace_id: "run-live-terminal-history-catchup",
    });
    setRuntimeStateFromEvents([prefixEvent]);
    listSessionMessagesMock.mockResolvedValue([]);

    const { container, queryClient } = renderTimeline();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(screen.getByText(streamedPrefix)).toBeVisible();

    await act(async () => {
      setRuntimeStateFromEvents([prefixEvent, completedEvent]);
    });
    await act(async () => {
      await Promise.resolve();
    });

    const rowBeforeHistory = container.querySelector<HTMLElement>("article.at-message");
    expect(rowBeforeHistory).not.toBeNull();
    for (let frame = 0; frame < 220; frame += 1) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(36);
      });
    }
    expect(screen.getByText(finalAnswer)).toBeVisible();
    expect(container.querySelector(".at-message-streaming-text")).toBeNull();

    await act(async () => {
      queryClient.setQueryData(["sessions", "session-1", "messages"], [
        {
          content: finalAnswer,
          message_id: "assistant-live-terminal-history-catchup-final",
          role_id: "MainAgent",
          run_id: "run-live-terminal-history-catchup",
        },
      ]);
    });

    const rowAfterHistory = container.querySelector<HTMLElement>("article.at-message");
    expect(rowAfterHistory).toBe(rowBeforeHistory);
    expect(screen.getByText(finalAnswer)).toBeVisible();
    expect(container.querySelector(".at-message-streaming-text")).toBeNull();
    expect(container.querySelectorAll(".streaming-cursor")).toHaveLength(0);
    expect(container.querySelectorAll("article.at-message")).toHaveLength(1);
  });

  it("does not replay a fully streamed text answer when history catches up without terminal output", async () => {
    vi.stubEnv("MODE", "production");
    vi.useFakeTimers();
    const finalAnswer = [
      "LIVE_STREAM_ALPHA",
      "LIVE_STREAM_BETA",
      "LIVE_STREAM_GAMMA",
      "LIVE_STREAM_DELTA",
      "LIVE_STREAM_EPSILON",
      "LIVE_STREAM_ZETA",
      "LIVE_STREAM_ETA",
      "LIVE_STREAM_THETA",
      "LIVE_STREAM_IOTA",
      "LIVE_STREAM_KAPPA",
    ].join(" ");
    const textEvent = relayRunEvent({
      event_id: 1,
      event_type: "text_delta",
      payload_json: JSON.stringify({ text: finalAnswer }),
      run_id: "run-live-text-history-catchup",
      trace_id: "run-live-text-history-catchup",
    });
    const completedEvent = relayRunEvent({
      event_id: 2,
      event_type: "run_completed",
      payload_json: JSON.stringify({ status: "completed" }),
      run_id: "run-live-text-history-catchup",
      trace_id: "run-live-text-history-catchup",
    });
    setRuntimeStateFromEvents([textEvent]);
    listSessionMessagesMock.mockResolvedValue([]);

    const { container, queryClient } = renderTimeline();

    for (let frame = 0; frame < 260; frame += 1) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(36);
      });
    }
    expect(screen.getByText(finalAnswer)).toBeVisible();
    const rowBeforeTerminal = container.querySelector<HTMLElement>("article.at-message");
    const textNodeBeforeTerminal = container.querySelector<HTMLElement>(".at-message-text");
    expect(rowBeforeTerminal).not.toBeNull();
    expect(textNodeBeforeTerminal).not.toBeNull();
    expect(container.querySelector(".at-message-streaming-text")).not.toBeNull();

    await act(async () => {
      setRuntimeStateFromEvents([textEvent, completedEvent]);
    });
    expect(screen.getByText(finalAnswer)).toBeVisible();
    const rowBeforeHistory = container.querySelector<HTMLElement>("article.at-message");
    const textNodeBeforeHistory = container.querySelector<HTMLElement>(".at-message-text");
    expect(rowBeforeHistory).toBe(rowBeforeTerminal);
    expect(textNodeBeforeHistory).toBe(textNodeBeforeTerminal);
    expect(container.querySelector(".at-message-streaming-text")).toBeNull();

    await act(async () => {
      queryClient.setQueryData(["sessions", "session-1", "messages"], [
        {
          content: finalAnswer,
          message_id: "assistant-live-text-history-catchup-final",
          role_id: "MainAgent",
          run_id: "run-live-text-history-catchup",
        },
      ]);
    });

    const rowAfterHistory = container.querySelector<HTMLElement>("article.at-message");
    const textNodeAfterHistory = container.querySelector<HTMLElement>(".at-message-text");
    expect(rowAfterHistory).toBe(rowBeforeHistory);
    expect(textNodeAfterHistory).toBe(textNodeBeforeHistory);
    expect(screen.getByText(finalAnswer)).toBeVisible();
    expect(container.querySelector(".at-message-streaming-text")).toBeNull();
    expect(container.querySelectorAll(".streaming-cursor")).toHaveLength(0);
    expect(container.querySelectorAll("article.at-message")).toHaveLength(1);
  });

  it("does not restart reveal after a completed stream receives repeated history refreshes", async () => {
    vi.stubEnv("MODE", "production");
    vi.useFakeTimers();
    const finalAnswer = [
      "LIVE_STREAM_ALPHA",
      "LIVE_STREAM_BETA",
      "LIVE_STREAM_GAMMA",
      "LIVE_STREAM_DELTA",
      "LIVE_STREAM_EPSILON",
      "LIVE_STREAM_ZETA",
      "LIVE_STREAM_ETA",
      "LIVE_STREAM_THETA",
      "LIVE_STREAM_IOTA",
      "LIVE_STREAM_KAPPA",
    ].join(" ");
    const runId = "run-live-history-refresh-no-replay";
    const textEvent = relayRunEvent({
      event_id: 1,
      event_type: "text_delta",
      payload_json: JSON.stringify({ text: finalAnswer }),
      run_id: runId,
      trace_id: runId,
    });
    const completedEvent = relayRunEvent({
      event_id: 2,
      event_type: "run_completed",
      payload_json: JSON.stringify({ status: "completed" }),
      run_id: runId,
      trace_id: runId,
    });
    setRuntimeStateFromEvents([textEvent]);
    listSessionMessagesMock.mockResolvedValue([]);
    listSessionRoundsMock.mockResolvedValue({
      has_more: false,
      items: [
        {
          created_at: "2026-07-09T11:31:32Z",
          run_id: runId,
          run_status: "running",
          run_user_message: "Stream the deterministic live text.",
        },
      ],
      next_cursor: null,
    });

    const { container, queryClient } = renderTimeline();

    for (let frame = 0; frame < 260; frame += 1) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(36);
      });
    }
    expect(screen.getByText(finalAnswer)).toBeVisible();
    const rowBeforeTerminal = container.querySelector<HTMLElement>("article.at-message");
    const textNodeBeforeTerminal = container.querySelector<HTMLElement>(".at-message-text");
    expect(rowBeforeTerminal).not.toBeNull();
    expect(textNodeBeforeTerminal).not.toBeNull();
    expect(container.querySelector(".at-message-streaming-text")).not.toBeNull();

    await act(async () => {
      setRuntimeStateFromEvents([textEvent, completedEvent]);
    });
    expect(screen.getByText(finalAnswer)).toBeVisible();
    const rowAfterTerminal = container.querySelector<HTMLElement>("article.at-message");
    const textNodeAfterTerminal = container.querySelector<HTMLElement>(".at-message-text");
    expect(rowAfterTerminal).toBe(rowBeforeTerminal);
    expect(textNodeAfterTerminal).toBe(textNodeBeforeTerminal);
    expect(container.querySelector(".at-message-streaming-text")).toBeNull();
    expect(container.querySelectorAll(".streaming-cursor")).toHaveLength(0);

    await act(async () => {
      queryClient.setQueryData(["sessions", "session-1", "messages"], [
        {
          content: finalAnswer,
          message_id: "assistant-live-history-refresh-final-1",
          role_id: "MainAgent",
          run_id: runId,
        },
      ]);
      queryClient.setQueryData(["sessions", "session-1", "rounds", "rail"], [
        {
          created_at: "2026-07-09T11:31:32Z",
          run_id: runId,
          run_status: "completed",
          run_user_message: "Stream the deterministic live text.",
        },
      ]);
    });

    const rowAfterFirstHistory = container.querySelector<HTMLElement>("article.at-message");
    const textNodeAfterFirstHistory = container.querySelector<HTMLElement>(".at-message-text");
    expect(rowAfterFirstHistory).toBe(rowAfterTerminal);
    expect(textNodeAfterFirstHistory).toBe(textNodeAfterTerminal);
    expect(screen.getByText(finalAnswer)).toBeVisible();
    expect(container.querySelector(".at-message-streaming-text")).toBeNull();
    expect(container.querySelectorAll(".streaming-cursor")).toHaveLength(0);

    await act(async () => {
      queryClient.setQueryData(["sessions", "session-1", "messages"], [
        {
          content: finalAnswer,
          message_id: "assistant-live-history-refresh-final-2",
          role_id: "MainAgent",
          run_id: runId,
        },
      ]);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(84);
    });

    expect(container.querySelector<HTMLElement>("article.at-message"))
      .toBe(rowAfterFirstHistory);
    expect(container.querySelector<HTMLElement>(".at-message-text"))
      .toBe(textNodeAfterFirstHistory);
    expect(screen.getByText(finalAnswer)).toBeVisible();
    expect(container.querySelector(".at-message-streaming-text")).toBeNull();
    expect(container.querySelectorAll(".streaming-cursor")).toHaveLength(0);
    expect(container.querySelectorAll("article.at-message")).toHaveLength(1);
  });

  it("does not inherit reveal from a completed runtime row that already matches history", async () => {
    const finalAnswer = [
      "LIVE_STREAM_ALPHA",
      "LIVE_STREAM_BETA",
      "LIVE_STREAM_GAMMA",
      "LIVE_STREAM_DELTA",
      "LIVE_STREAM_EPSILON",
    ].join(" ");
    setRuntimeStateFromEvents([
      relayRunEvent({
        event_id: 1,
        event_type: "text_delta",
        payload_json: JSON.stringify({ text: finalAnswer }),
        run_id: "run-live-reveal-boundary",
        trace_id: "run-live-reveal-boundary",
      }),
      relayRunEvent({
        event_id: 2,
        event_type: "tool_call",
        payload_json: JSON.stringify({
          args: { cmd: "echo ok" },
          tool_call_id: "call-live-reveal-boundary",
          action_family: "run",
          semantic_category: "execution",
          tool_name: "shell",
        }),
        run_id: "run-live-reveal-boundary",
        trace_id: "run-live-reveal-boundary",
      }),
      relayRunEvent({
        event_id: 3,
        event_type: "run_completed",
        payload_json: JSON.stringify({ status: "completed" }),
        run_id: "run-live-reveal-boundary",
        trace_id: "run-live-reveal-boundary",
      }),
    ]);
    listSessionMessagesMock.mockResolvedValue([
      {
        content: finalAnswer,
        message_id: "assistant-live-reveal-boundary-final",
        role_id: "MainAgent",
        run_id: "run-live-reveal-boundary",
      },
    ]);

    const { container } = renderTimeline();

    expect(await screen.findByText(finalAnswer)).toBeVisible();
    expect(container.querySelectorAll("article.at-message")).toHaveLength(1);
    expect(container.querySelector(".at-message-streaming-text")).toBeNull();
    expect(container.querySelectorAll(".streaming-cursor")).toHaveLength(0);
    expect(container.querySelector<HTMLElement>("article.at-message")?.dataset.rowKey)
      .toBe("runtime-text:run-live-reveal-boundary:MainAgent:0");
  });

  it("does not preserve a closed runtime prefix when hydrated history has the final answer", async () => {
    const streamedPrefix = "LIVE_STREAM_ALPHA LIVE_STREAM_BETA";
    const finalAnswer = [
      streamedPrefix,
      "LIVE_STREAM_GAMMA",
      "LIVE_STREAM_DELTA",
      "LIVE_STREAM_EPSILON",
    ].join(" ");
    setRuntimeStateFromEvents([
      relayRunEvent({
        event_id: 1,
        event_type: "text_delta",
        payload_json: JSON.stringify({ text: streamedPrefix }),
        run_id: "run-live-prefix-tool-hydrate",
        trace_id: "run-live-prefix-tool-hydrate",
      }),
      relayRunEvent({
        event_id: 2,
        event_type: "tool_call",
        payload_json: JSON.stringify({
          args: { cmd: "echo ok" },
          tool_call_id: "call-live-prefix-tool-hydrate",
          action_family: "run",
          semantic_category: "execution",
          tool_name: "shell",
        }),
        run_id: "run-live-prefix-tool-hydrate",
        trace_id: "run-live-prefix-tool-hydrate",
      }),
      relayRunEvent({
        event_id: 3,
        event_type: "tool_result",
        payload_json: JSON.stringify({
          content: "ok",
          tool_call_id: "call-live-prefix-tool-hydrate",
          action_family: "run",
          semantic_category: "execution",
          tool_name: "shell",
        }),
        run_id: "run-live-prefix-tool-hydrate",
        trace_id: "run-live-prefix-tool-hydrate",
      }),
      relayRunEvent({
        event_id: 4,
        event_type: "run_completed",
        payload_json: JSON.stringify({ status: "completed" }),
        run_id: "run-live-prefix-tool-hydrate",
        trace_id: "run-live-prefix-tool-hydrate",
      }),
    ]);
    listSessionMessagesMock.mockResolvedValue([
      {
        content: finalAnswer,
        message_id: "assistant-live-prefix-tool-hydrate-final",
        role_id: "MainAgent",
        run_id: "run-live-prefix-tool-hydrate",
      },
    ]);

    const { container } = renderTimeline();

    expect(await screen.findByText(finalAnswer)).toBeVisible();
    expect(screen.queryByText(streamedPrefix, { exact: true }))
      .not.toBeInTheDocument();
    expect(container.querySelectorAll(".at-message-streaming-text")).toHaveLength(0);
    expect(container.querySelectorAll(".streaming-cursor")).toHaveLength(0);
    expect(container.querySelectorAll("article.at-message")).toHaveLength(1);
    expect(container.querySelector<HTMLElement>("article.at-message")?.dataset.rowKey)
      .toBe("runtime-text:run-live-prefix-tool-hydrate:MainAgent:0");
  });

  it("keeps terminal structured output mounted when history hydrates the answer", async () => {
    const finalAnswer = [
      "LIVE_STREAM_ALPHA",
      "LIVE_STREAM_BETA",
      "LIVE_STREAM_GAMMA",
      "LIVE_STREAM_DELTA",
    ].join(" ");
    setRuntimeStateFromEvents([
      relayRunEvent({
        event_id: 1,
        event_type: "run_completed",
        payload_json: JSON.stringify({
          output: [{ kind: "text", text: finalAnswer }],
        }),
        run_id: "run-terminal-structured-output",
        trace_id: "run-terminal-structured-output",
      }),
    ]);
    listSessionMessagesMock.mockResolvedValue([
      {
        content: finalAnswer,
        message_id: "assistant-terminal-structured-output",
        role_id: "MainAgent",
        run_id: "run-terminal-structured-output",
      },
    ]);

    const { container } = renderTimeline();

    await waitForSingleVisibleText(finalAnswer);
    const messageRow = container.querySelector<HTMLElement>("article.at-message");
    expect(messageRow).not.toBeNull();
    expect(messageRow?.dataset.rowKey).toBe(
      "runtime:run-terminal-structured-output:1:0",
    );
    expect(messageRow?.dataset.rowKey).not.toBe(
      "message:assistant-terminal-structured-output",
    );
    expect(container.querySelectorAll(".at-message-streaming-text")).toHaveLength(0);
    expect(container.querySelectorAll(".streaming-cursor")).toHaveLength(0);
  });

  it("does not duplicate run_completed output when text deltas already anchor the final answer", async () => {
    const finalAnswer = [
      "LIVE_STREAM_ALPHA",
      "LIVE_STREAM_BETA",
      "LIVE_STREAM_GAMMA",
      "LIVE_STREAM_DELTA",
    ].join(" ");
    setRuntimeStateFromEvents([
      relayRunEvent({
        event_id: 1,
        event_type: "text_delta",
        payload_json: JSON.stringify({ text: finalAnswer }),
        run_id: "run-terminal-duplicate-output",
        trace_id: "run-terminal-duplicate-output",
      }),
      relayRunEvent({
        event_id: 2,
        event_type: "run_completed",
        payload_json: JSON.stringify({
          output: [{ kind: "text", text: finalAnswer }],
        }),
        run_id: "run-terminal-duplicate-output",
        trace_id: "run-terminal-duplicate-output",
      }),
    ]);
    listSessionMessagesMock.mockResolvedValue([
      {
        content: finalAnswer,
        message_id: "assistant-terminal-duplicate-output",
        role_id: "MainAgent",
        run_id: "run-terminal-duplicate-output",
      },
    ]);

    const { container } = renderTimeline();

    await waitForSingleVisibleText(finalAnswer);
    expect(container.querySelectorAll("article.at-message")).toHaveLength(1);
    const messageRow = container.querySelector<HTMLElement>("article.at-message");
    expect(messageRow?.dataset.rowKey).toBe(
      "runtime-text:run-terminal-duplicate-output:MainAgent:0",
    );
    expect(container.querySelectorAll(".at-message-streaming-text")).toHaveLength(0);
    expect(container.querySelectorAll(".streaming-cursor")).toHaveLength(0);
  });

  it("merges terminal structured output into the previous runtime text row before hydration", async () => {
    const finalAnswer = [
      "LIVE_STREAM_ALPHA",
      "LIVE_STREAM_BETA",
      "LIVE_STREAM_GAMMA",
      "LIVE_STREAM_DELTA",
    ].join(" ");
    setRuntimeStateFromEvents([
      relayRunEvent({
        event_id: 1,
        event_type: "text_delta",
        payload_json: JSON.stringify({ text: "LIVE_STREAM_ALPHA" }),
        run_id: "run-terminal-runtime-only",
        trace_id: "run-terminal-runtime-only",
      }),
      relayRunEvent({
        event_id: 2,
        event_type: "run_completed",
        payload_json: JSON.stringify({
          output: [{ kind: "text", text: finalAnswer }],
        }),
        run_id: "run-terminal-runtime-only",
        trace_id: "run-terminal-runtime-only",
      }),
    ]);
    listSessionMessagesMock.mockResolvedValue([]);

    const { container } = renderTimeline();

    await waitForSingleVisibleText(finalAnswer);
    expect(container.querySelectorAll("article.at-message")).toHaveLength(1);
    const messageRow = container.querySelector<HTMLElement>("article.at-message");
    expect(messageRow?.dataset.rowKey).toBe(
      "runtime-text:run-terminal-runtime-only:MainAgent:0",
    );
    expect(messageRow?.dataset.rowKey).not.toBe(
      "runtime:run-terminal-runtime-only:2:1",
    );
    expect(screen.queryByText("LIVE_STREAM_ALPHA")).not.toBeInTheDocument();
    expect(container.querySelectorAll(".at-message-streaming-text")).toHaveLength(0);
    expect(container.querySelectorAll(".streaming-cursor")).toHaveLength(0);
  });

  it("fills terminal structured output without replaying the displayed runtime prefix", async () => {
    vi.stubEnv("MODE", "production");
    vi.useFakeTimers();
    const streamedPrefix = "LI";
    const finalAnswer = [
      streamedPrefix,
      "LIVE_STREAM_ALPHA",
      "LIVE_STREAM_BETA",
      "LIVE_STREAM_GAMMA",
      "LIVE_STREAM_DELTA",
      "LIVE_STREAM_EPSILON",
    ].join(" ");
    const prefixEvent = relayRunEvent({
      event_id: 1,
      event_type: "text_delta",
      payload_json: JSON.stringify({ text: streamedPrefix }),
      run_id: "run-terminal-reveal-from-prefix",
      trace_id: "run-terminal-reveal-from-prefix",
    });
    setRuntimeStateFromEvents([prefixEvent]);
    listSessionMessagesMock.mockResolvedValue([]);

    const { container } = renderTimeline();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(screen.getByText(streamedPrefix)).toBeVisible();
    const rowBefore = container.querySelector<HTMLElement>("article.at-message");
    expect(rowBefore).not.toBeNull();

    await act(async () => {
      setRuntimeStateFromEvents([
        prefixEvent,
        relayRunEvent({
          event_id: 2,
          event_type: "run_completed",
          payload_json: JSON.stringify({
            output: [{ kind: "text", text: finalAnswer }],
          }),
          run_id: "run-terminal-reveal-from-prefix",
          trace_id: "run-terminal-reveal-from-prefix",
        }),
      ]);
    });

    const rowAfterTerminal = container.querySelector<HTMLElement>("article.at-message");
    expect(rowAfterTerminal).toBe(rowBefore);
    expect(container.querySelectorAll("article.at-message")).toHaveLength(1);
    expect(screen.getByText(finalAnswer)).toBeVisible();
    expect(container.querySelector(".at-message-streaming-text")).toBeNull();
    expect(container.querySelectorAll(".streaming-cursor")).toHaveLength(0);
    expect(container.querySelectorAll("article.at-message")).toHaveLength(1);
    expect(container.querySelector<HTMLElement>("article.at-message")).toBe(rowBefore);
    expect(container.querySelector(".at-message-streaming-text")).toBeNull();
    expect(container.querySelectorAll(".streaming-cursor")).toHaveLength(0);
  });

  it("keeps the runtime answer mounted when processed hydration splits thinking from final text", async () => {
    const finalAnswer = [
      "LIVE_STREAM_ALPHA",
      "LIVE_STREAM_BETA",
      "LIVE_STREAM_GAMMA",
      "LIVE_STREAM_DELTA",
      "LIVE_STREAM_EPSILON",
      "LIVE_STREAM_ZETA",
      "LIVE_STREAM_ETA",
      "LIVE_STREAM_THETA",
      "LIVE_STREAM_IOTA",
      "LIVE_STREAM_KAPPA",
    ].join(" ");
    const streamedPrefix = "LIVE_STREAM_ALPHA LIVE_STREAM_BETA";
    const streamEntry: TimelineEntry = {
      eventId: 8,
      id: "run-live-processed-hydrate:8:0",
      kind: "text_delta",
      occurredAt: "2026-06-23T00:00:00Z",
      payload: { text: streamedPrefix },
      roleId: "MainAgent",
      runId: "run-live-processed-hydrate",
      sessionId: "session-1",
      text: streamedPrefix,
    };
    useRuntimeStore.setState({
      runtimeState: {
        activeRunIds: ["run-live-processed-hydrate"],
        runs: {
          "run-live-processed-hydrate": {
            entries: [streamEntry],
            hadVisibleTextStream: true,
            lastEventId: 8,
            runId: "run-live-processed-hydrate",
            seenEventKeys: [],
            status: "open",
            terminalEventType: null,
          },
        },
      },
    });
    listSessionMessagesMock.mockResolvedValue([]);

    const { container, queryClient } = renderTimeline();

    expect(await screen.findByText(streamedPrefix)).toBeVisible();
    const rowBefore = container.querySelector<HTMLElement>("article.at-message");
    expect(rowBefore).not.toBeNull();
    expect(rowBefore?.dataset.rowKey).toBe(
      "runtime-text:run-live-processed-hydrate:MainAgent:0",
    );

    act(() => {
      queryClient.setQueryData(["sessions", "session-1", "messages"], [
        {
          message: {
            parts: [
              {
                content: "The user wants me to output the same text again.",
                part_kind: "thinking",
              },
              {
                content: finalAnswer,
                part_kind: "text",
              },
            ],
          },
          message_id: "assistant-live-processed-hydrate-final",
          role_id: "MainAgent",
          run_id: "run-live-processed-hydrate",
        },
      ]);
      useRuntimeStore.setState({
        runtimeState: {
          activeRunIds: [],
          runs: {
            "run-live-processed-hydrate": {
              entries: [
                streamEntry,
                {
                  eventId: 9,
                  id: "run-live-processed-hydrate:9:1",
                  kind: "run_completed",
                  occurredAt: "2026-06-23T00:00:01Z",
                  payload: { status: "completed" },
                  roleId: "MainAgent",
                  runId: "run-live-processed-hydrate",
                  sessionId: "session-1",
                  text: "completed",
                },
              ],
              hadVisibleTextStream: true,
              lastEventId: 9,
              runId: "run-live-processed-hydrate",
              seenEventKeys: [],
              status: "closed",
              terminalEventType: "run_completed",
            },
          },
        },
      });
    });

    await waitForSingleVisibleText(finalAnswer);
    expect(container.querySelector("details.at-processed-group")).not.toBeNull();
    const rowAfter = container.querySelector<HTMLElement>("article.at-message");
    expect(rowAfter).toBe(rowBefore);
    expect(rowAfter?.dataset.rowKey).toBe(
      "runtime-text:run-live-processed-hydrate:MainAgent:0",
    );
    expect(rowAfter).not.toHaveClass("is-streaming");
    expect(container.querySelectorAll(".at-message-streaming-text")).toHaveLength(0);
    expect(container.querySelectorAll(".streaming-cursor")).toHaveLength(0);
  });

  it("keeps a fully streamed answer mounted when processed hydration arrives", async () => {
    vi.stubEnv("MODE", "production");
    vi.useFakeTimers();
    const finalAnswer = [
      "LIVE_STREAM_ALPHA",
      "LIVE_STREAM_BETA",
      "LIVE_STREAM_GAMMA",
      "LIVE_STREAM_DELTA",
      "LIVE_STREAM_EPSILON",
      "LIVE_STREAM_ZETA",
      "LIVE_STREAM_ETA",
      "LIVE_STREAM_THETA",
      "LIVE_STREAM_IOTA",
      "LIVE_STREAM_KAPPA",
    ].join(" ");
    const thinkingText = "The user wants me to output the same text again.";
    const streamEntry: TimelineEntry = {
      eventId: 8,
      id: "run-live-full-hydrate:8:0",
      kind: "text_delta",
      occurredAt: "2026-06-23T00:00:00Z",
      payload: { text: finalAnswer },
      roleId: "MainAgent",
      runId: "run-live-full-hydrate",
      sessionId: "session-1",
      text: finalAnswer,
    };
    useRuntimeStore.setState({
      runtimeState: {
        activeRunIds: ["run-live-full-hydrate"],
        runs: {
          "run-live-full-hydrate": {
            entries: [streamEntry],
            hadVisibleTextStream: true,
            lastEventId: 8,
            runId: "run-live-full-hydrate",
            seenEventKeys: [],
            status: "open",
            terminalEventType: null,
          },
        },
      },
    });
    listSessionMessagesMock.mockResolvedValue([]);

    const { container, queryClient } = renderTimeline();

    for (let frame = 0; frame < 80; frame += 1) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(36);
      });
    }
    expect(container.querySelector(".at-message-streaming-text")).toHaveTextContent(
      finalAnswer,
    );
    expect(screen.getByText(finalAnswer)).toBeVisible();
    const rowBefore = container.querySelector<HTMLElement>("article.at-message");
    expect(rowBefore).not.toBeNull();
    expect(rowBefore?.dataset.rowKey).toBe(
      "runtime-text:run-live-full-hydrate:MainAgent:0",
    );

    act(() => {
      queryClient.setQueryData(["sessions", "session-1", "messages"], [
        {
          message: {
            parts: [
              {
                content: thinkingText,
                part_kind: "thinking",
              },
              {
                content: finalAnswer,
                part_kind: "text",
              },
            ],
          },
          message_id: "assistant-live-full-hydrate-final",
          role_id: "MainAgent",
          run_id: "run-live-full-hydrate",
        },
      ]);
      useRuntimeStore.setState({
        runtimeState: {
          activeRunIds: [],
          runs: {
            "run-live-full-hydrate": {
              entries: [
                streamEntry,
                {
                  eventId: 9,
                  id: "run-live-full-hydrate:9:1",
                  kind: "run_completed",
                  occurredAt: "2026-06-23T00:00:01Z",
                  payload: { status: "completed" },
                  roleId: "MainAgent",
                  runId: "run-live-full-hydrate",
                  sessionId: "session-1",
                  text: "completed",
                },
              ],
              hadVisibleTextStream: true,
              lastEventId: 9,
              runId: "run-live-full-hydrate",
              seenEventKeys: [],
              status: "closed",
              terminalEventType: "run_completed",
            },
          },
        },
      });
    });

    expect(container.querySelector("details.at-processed-group")).not.toBeNull();
    const rowAfter = container.querySelector<HTMLElement>("article.at-message");
    expect(rowAfter).toBe(rowBefore);
    expect(rowAfter?.dataset.rowKey).toBe(
      "runtime-text:run-live-full-hydrate:MainAgent:0",
    );
    expect(rowAfter).not.toHaveTextContent(thinkingText);
    expect(container.querySelector(".at-message-streaming-text")).toBeNull();
    expect(screen.getAllByText(finalAnswer)).toHaveLength(1);
    expect(container.querySelectorAll(".streaming-cursor")).toHaveLength(0);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(36);
    });

    expect(rowAfter).toBe(rowBefore);
    expect(container.querySelector(".at-message-streaming-text")).toBeNull();
    expect(container.querySelectorAll(".streaming-cursor")).toHaveLength(0);
    expect(screen.getAllByText(finalAnswer)).toHaveLength(1);
  });

  it("keeps a live full-chunk stream mounted after history hydration", async () => {
    const finalAnswer = [
      "LIVE_STREAM_ALPHA",
      "LIVE_STREAM_BETA",
      "LIVE_STREAM_GAMMA",
      "LIVE_STREAM_DELTA",
      "LIVE_STREAM_EPSILON",
      "LIVE_STREAM_ZETA",
      "LIVE_STREAM_ETA",
      "LIVE_STREAM_THETA",
      "LIVE_STREAM_IOTA",
      "LIVE_STREAM_KAPPA",
    ].join(" ");
    const streamEntry: TimelineEntry = {
      eventId: 8,
      id: "run-live-full-chunk-hydrate:8:0",
      kind: "text_delta",
      occurredAt: "2026-06-23T00:00:00Z",
      payload: { text: finalAnswer },
      roleId: "MainAgent",
      runId: "run-live-full-chunk-hydrate",
      sessionId: "session-1",
      text: finalAnswer,
    };
    useRuntimeStore.setState({
      runtimeState: {
        activeRunIds: ["run-live-full-chunk-hydrate"],
        runs: {
          "run-live-full-chunk-hydrate": {
            entries: [streamEntry],
            hadVisibleTextStream: true,
            lastEventId: 8,
            runId: "run-live-full-chunk-hydrate",
            seenEventKeys: [],
            status: "open",
            targetRoleId: "MainAgent",
            terminalEventType: null,
          },
        },
      },
    });
    listSessionMessagesMock.mockResolvedValue([]);

    const { container, queryClient } = renderTimeline();

    const streamingBlock = container.querySelector<HTMLElement>(
      ".at-message-streaming-text",
    );
    if (streamingBlock === null) {
      throw new Error("Expected a streaming text block for the live answer.");
    }
    expect(streamingBlock).toHaveTextContent(finalAnswer);
    const rowBeforeHydration = container.querySelector<HTMLElement>("article.at-message");
    expect(rowBeforeHydration).not.toBeNull();
    expect(rowBeforeHydration?.dataset.rowKey).toBe(
      "runtime-text:run-live-full-chunk-hydrate:MainAgent:0",
    );

    act(() => {
      queryClient.setQueryData(["sessions", "session-1", "messages"], [
        {
          message: {
            parts: [
              {
                content: "The user wants me to output the same text again.",
                part_kind: "thinking",
              },
              {
                content: finalAnswer,
                part_kind: "text",
              },
            ],
          },
          message_id: "assistant-live-full-chunk-hydrate-final",
          role_id: "MainAgent",
          run_id: "run-live-full-chunk-hydrate",
        },
      ]);
      useRuntimeStore.setState({
        runtimeState: {
          activeRunIds: [],
          runs: {
            "run-live-full-chunk-hydrate": {
              entries: [
                streamEntry,
                {
                  eventId: 9,
                  id: "run-live-full-chunk-hydrate:9:1",
                  kind: "run_completed",
                  occurredAt: "2026-06-23T00:00:01Z",
                  payload: { status: "completed" },
                  roleId: "MainAgent",
                  runId: "run-live-full-chunk-hydrate",
                  sessionId: "session-1",
                  text: "completed",
                },
              ],
              hadVisibleTextStream: true,
              lastEventId: 9,
              runId: "run-live-full-chunk-hydrate",
              seenEventKeys: [],
              status: "closed",
              terminalEventType: "run_completed",
            },
          },
        },
      });
    });

    const rowAfterHydration = container.querySelector<HTMLElement>("article.at-message");
    expect(rowAfterHydration).toBe(rowBeforeHydration);
    expect(rowAfterHydration?.dataset.rowKey).toBe(
      "runtime-text:run-live-full-chunk-hydrate:MainAgent:0",
    );
    expect(container.querySelector(".at-message-streaming-text")).toBeNull();
    expect(container.querySelectorAll(".streaming-cursor")).toHaveLength(0);
    expect(screen.getAllByText(finalAnswer)).toHaveLength(1);
  });

  it("merges terminal structured output into the active runtime text row", async () => {
    useRuntimeStore.setState({
      runtimeState: {
        activeRunIds: [],
        runs: {
          "run-terminal-output": {
            entries: [
              {
                eventId: 8,
                id: "run-terminal-output:8:0",
                kind: "text_delta",
                occurredAt: "2026-06-23T00:00:00Z",
                payload: { text: "LIVE_STRE" },
                roleId: "MainAgent",
                runId: "run-terminal-output",
                sessionId: "session-1",
                text: "LIVE_STRE",
              },
              {
                eventId: 9,
                id: "run-terminal-output:9:1",
                kind: "run_completed",
                occurredAt: "2026-06-23T00:00:01Z",
                payload: {
                  output: [
                    {
                      kind: "text",
                      text: "LIVE_STREAM_ALPHA LIVE_STREAM_BETA LIVE_STREAM_KAPPA",
                    },
                  ],
                  status: "completed",
                },
                roleId: "MainAgent",
                runId: "run-terminal-output",
                sessionId: "session-1",
                text: "completed",
              },
            ],
            hadVisibleTextStream: true,
            lastEventId: 9,
            runId: "run-terminal-output",
            seenEventKeys: [],
            status: "closed",
            terminalEventType: "run_completed",
          },
        },
      },
    });
    listSessionMessagesMock.mockResolvedValue([]);

    const { container } = renderTimeline();

    expect(
      await screen.findByText("LIVE_STREAM_ALPHA LIVE_STREAM_BETA LIVE_STREAM_KAPPA"),
    ).toBeVisible();
    expect(screen.queryByText("LIVE_STRE")).not.toBeInTheDocument();
    expect(container.querySelectorAll("article.at-message")).toHaveLength(1);
  });

  it("consumes terminal runtime prefixes after a persisted answer row arrives", async () => {
    useRuntimeStore.setState({
      runtimeState: {
        activeRunIds: [],
        runs: {
          "run-terminal-prefix-row": {
            entries: [
              {
                eventId: 8,
                id: "run-terminal-prefix-row:8:0",
                kind: "text_delta",
                occurredAt: "2026-06-23T00:00:00Z",
                payload: { text: "LIVE_STRE" },
                roleId: "MainAgent",
                runId: "run-terminal-prefix-row",
                sessionId: "session-1",
                text: "LIVE_STRE",
              },
              {
                eventId: 9,
                id: "run-terminal-prefix-row:9:1",
                kind: "run_completed",
                occurredAt: "2026-06-23T00:00:01Z",
                payload: { status: "completed" },
                roleId: "MainAgent",
                runId: "run-terminal-prefix-row",
                sessionId: "session-1",
                text: "completed",
              },
            ],
            hadVisibleTextStream: false,
            lastEventId: 9,
            runId: "run-terminal-prefix-row",
            seenEventKeys: [],
            status: "closed",
            terminalEventType: "run_completed",
          },
        },
      },
    });
    listSessionMessagesMock.mockResolvedValue([
      {
        content: "LIVE_STREAM_ALPHA LIVE_STREAM_BETA LIVE_STREAM_KAPPA",
        message_id: "assistant-terminal-prefix-final",
        role_id: "MainAgent",
        run_id: "run-terminal-prefix-row",
      },
    ]);

    const { container } = renderTimeline();

    expect(
      await screen.findByText("LIVE_STREAM_ALPHA LIVE_STREAM_BETA LIVE_STREAM_KAPPA"),
    ).toBeVisible();
    expect(screen.queryByText("LIVE_STRE")).not.toBeInTheDocument();
    expect(container.querySelectorAll("article.at-message")).toHaveLength(1);
  });

  it("consumes repeated terminal runtime tails after the persisted answer row arrives", async () => {
    const finalAnswer = "LIVE_STREAM_ALPHA LIVE_STREAM_BETA LIVE_STREAM_KAPPA";
    useRuntimeStore.setState({
      runtimeState: {
        activeRunIds: [],
        runs: {
          "run-terminal-repeated-tail": {
            entries: [
              {
                eventId: 8,
                id: "run-terminal-repeated-tail:8:0",
                kind: "text_delta",
                occurredAt: "2026-06-23T00:00:00Z",
                payload: { text: `${finalAnswer}LIVE_STREAM_A` },
                roleId: "MainAgent",
                runId: "run-terminal-repeated-tail",
                sessionId: "session-1",
                text: `${finalAnswer}LIVE_STREAM_A`,
              },
              {
                eventId: 9,
                id: "run-terminal-repeated-tail:9:1",
                kind: "run_completed",
                occurredAt: "2026-06-23T00:00:01Z",
                payload: { status: "completed" },
                roleId: "MainAgent",
                runId: "run-terminal-repeated-tail",
                sessionId: "session-1",
                text: "completed",
              },
            ],
            hadVisibleTextStream: false,
            lastEventId: 9,
            runId: "run-terminal-repeated-tail",
            seenEventKeys: [],
            status: "closed",
            terminalEventType: "run_completed",
          },
        },
      },
    });
    listSessionMessagesMock.mockResolvedValue([
      {
        content: finalAnswer,
        message_id: "assistant-terminal-repeated-tail-final",
        role_id: "MainAgent",
        run_id: "run-terminal-repeated-tail",
      },
    ]);

    const { container } = renderTimeline();

    expect(await screen.findByText(finalAnswer)).toBeVisible();
    expect(screen.queryByText(`${finalAnswer}LIVE_STREAM_A`)).not.toBeInTheDocument();
    expect(container.querySelectorAll("article.at-message")).toHaveLength(1);
  });

  it("copies the latest non-user answer", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    listSessionMessagesMock.mockResolvedValue([
      {
        message_id: "user-1",
        role: "user",
        content: "What changed?",
      },
      {
        message_id: "assistant-1",
        role: "assistant",
        content: "Earlier answer",
      },
      {
        message_id: "assistant-2",
        role_id: "MainAgent",
        message: {
          parts: [{ kind: "text", text: "Latest answer" }],
        },
      },
    ]);

    const { container } = renderTimeline();

    const copyButton = await screen.findByRole("button", {
      name: "Copy last answer",
    });
    await waitFor(() => expect(copyButton).toBeEnabled());
    expect(container.querySelector(".at-timeline-toolbar")).toBeNull();
    expect(copyButton.closest("article.at-message")).toHaveAttribute(
      "data-row-key",
      "message:assistant-2",
    );
    fireEvent.click(copyButton);

    await waitFor(() => expect(writeText).toHaveBeenCalledWith("Latest answer"));
  });

  it("keeps final answer actions enabled for a stale open run outside activeRunIds", async () => {
    setRuntimeEntries([
      runtimeTextDeltaEntry({
        eventId: 1,
        id: "run-output:1:0",
        text: "Stale open answer",
      }),
    ], "open", {
      scope: "session",
      sessionId: "session-1",
    });
    useRuntimeStore.setState((state) => ({
      runtimeState: {
        ...state.runtimeState,
        activeRunIds: [],
      },
    }));
    listSessionMessagesMock.mockResolvedValue([]);

    renderTimeline();

    expect(await screen.findByRole("button", { name: "Copy last answer" }))
      .toBeEnabled();
  });

  it("disables final answer actions while the scoped run is truly active", async () => {
    setRuntimeEntries([
      runtimeTextDeltaEntry({
        eventId: 1,
        id: "run-output:1:0",
        text: "Active streaming answer",
      }),
    ], "open", {
      scope: "session",
      sessionId: "session-1",
    });
    listSessionMessagesMock.mockResolvedValue([]);

    renderTimeline();

    expect(await screen.findByRole("button", { name: "Copy last answer" }))
      .toBeDisabled();
  });

  it("enables final answer actions as soon as the terminal run leaves activeRunIds", async () => {
    setRuntimeEntries([
      runtimeTextDeltaEntry({
        eventId: 1,
        id: "run-output:1:0",
        text: "Terminal answer",
      }),
    ], "open", {
      scope: "session",
      sessionId: "session-1",
    });
    listSessionMessagesMock.mockResolvedValue([]);

    renderTimeline();

    const copyButton = await screen.findByRole("button", {
      name: "Copy last answer",
    });
    expect(copyButton).toBeDisabled();

    act(() => {
      useRuntimeStore.setState((state) => ({
        runtimeState: {
          ...state.runtimeState,
          activeRunIds: [],
        },
      }));
    });

    await waitFor(() => expect(copyButton).toBeEnabled());
  });

  it("reads the latest answer aloud from the same final answer actions", async () => {
    class FakeSpeechSynthesisUtterance {
      lang = "";

      readonly text: string;

      constructor(text = "") {
        this.text = text;
      }
    }
    const cancel = vi.fn();
    const speak = vi.fn();
    vi.stubGlobal("speechSynthesis", { cancel, speak });
    vi.stubGlobal("SpeechSynthesisUtterance", FakeSpeechSynthesisUtterance);
    listSessionMessagesMock.mockResolvedValue([
      {
        message_id: "user-1",
        role: "user",
        content: "Read this?",
      },
      {
        message_id: "assistant-1",
        role: "assistant",
        content: "Earlier answer",
      },
      {
        message_id: "assistant-2",
        role_id: "MainAgent",
        content: "Latest answer",
      },
    ]);

    renderTimeline();

    const readButton = await screen.findByRole("button", {
      name: "Read last answer aloud",
    });
    await waitFor(() => expect(readButton).toBeEnabled());
    const actions = readButton.closest(".at-message-actions");
    expect(actions).not.toBeNull();
    expect(actions?.previousElementSibling).toHaveClass("at-message-content");
    expect(
      within(actions as HTMLElement).getByRole("button", {
        name: "Copy last answer",
      }),
    ).toBeVisible();

    fireEvent.click(readButton);

    await waitFor(() => expect(speak).toHaveBeenCalledTimes(1));
    expect(cancel).toHaveBeenCalledTimes(1);
    const spoken = speak.mock.calls[0]?.[0] as FakeSpeechSynthesisUtterance | undefined;
    expect(spoken).toBeInstanceOf(FakeSpeechSynthesisUtterance);
    expect(spoken?.text).toBe("Latest answer");
  });

  it("does not let runtime terminal rows replace the copied answer", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    setRuntimeEntries([
      runtimeTextDeltaEntry({
        eventId: 2,
        id: "run-output:2:0",
        text: "Streamed answer before terminal state",
      }),
      {
        eventId: 3,
        id: "run-output:3:1",
        kind: "run_completed",
        occurredAt: "2026-06-23T00:00:03Z",
        payload: { status: "completed" },
        roleId: "MainAgent",
        runId: "run-output",
        sessionId: "session-1",
        text: "run.completed",
      },
    ]);
    listSessionMessagesMock.mockResolvedValue([]);

    renderTimeline();

    expect(await screen.findByText("Streamed answer before terminal state"))
      .toBeVisible();
    expect(screen.queryByText("Run completed: status completed")).not.toBeInTheDocument();
    const copyButton = await screen.findByRole("button", {
      name: "Copy last answer",
    });
    await waitFor(() => expect(copyButton).toBeEnabled());
    fireEvent.click(copyButton);

    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(
        "Streamed answer before terminal state",
      ),
    );
    expect(writeText).not.toHaveBeenCalledWith("Run completed: status completed");
  });

  it("collapses completed thinking and tool work while keeping final answer actions below it", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    listSessionMessagesMock.mockResolvedValue([
      {
        message: {
          parts: [
            {
              content: "Inspecting the workspace",
              part_kind: "thinking",
            },
            {
              args: { path: "." },
              part_kind: "tool-call",
              tool_call_id: "tool-1",
              action_family: "read",
              semantic_category: "file-read",
              tool_name: "read",
            },
            {
              content: { ok: true, data: "workspace ready" },
              part_kind: "tool-return",
              tool_call_id: "tool-1",
              action_family: "read",
              semantic_category: "file-read",
              tool_name: "read",
            },
            {
              content: "Final answer ready",
              part_kind: "text",
            },
          ],
        },
        message_id: "assistant-processed",
        role_id: "MainAgent",
        run_id: "run-processed",
      },
    ]);
    listSessionRoundsMock.mockResolvedValue({
      has_more: false,
      items: [
        {
          created_at: "2026-06-23T12:42:33Z",
          run_id: "run-processed",
          run_status: "completed",
          run_user_message: "Run processed group check",
        },
      ],
      next_cursor: null,
    });

    const { container } = renderTimeline();

    await waitFor(() => {
      expect(screen.getByText("Final answer ready")).toBeVisible();
    });
    const group = container.querySelector("details.at-processed-group");
    expect(group).not.toBeNull();
    expect(group).not.toHaveAttribute("open");
    expect(await screen.findByText("Processed")).toBeVisible();
    expect(screen.getByText("Inspecting the workspace")).not.toBeVisible();
    expect(screen.getByText("Read: read")).not.toBeVisible();

    const copyButton = screen.getByRole("button", {
      name: "Copy last answer",
    });
    const actions = copyButton.closest(".at-message-actions");
    expect(actions).not.toBeNull();
    expect(actions?.previousElementSibling).toHaveClass("at-message-content");
    expect(copyButton.closest(".at-processed-group")).toBeNull();
    expect(copyButton.closest("article.at-message"))
      .toHaveTextContent("Final answer ready");

    fireEvent.click(copyButton);

    await waitFor(() => expect(writeText).toHaveBeenCalledWith("Final answer ready"));
  });

  it("collapses the previous round work as soon as the user sends the next message", async () => {
    listSessionMessagesMock.mockResolvedValue([{
      agent_role_id: "RenamedPrimary",
      instance_id: "root-instance",
      message: {
        parts: [
          { content: "Previous round thought", part_kind: "thinking" },
          { content: "Previous round answer", part_kind: "text" },
        ],
      },
      message_id: "previous-round-answer",
      role_id: "RenamedPrimary",
      run_id: "opaque-previous-run",
      task_id: "root-task",
    }]);
    listSessionRoundsMock.mockResolvedValue({
      has_more: false,
      items: [{
        primary_instance_id: "root-instance",
        primary_role_id: "RenamedPrimary",
        primary_task_id: "root-task",
        run_id: "opaque-previous-run",
        run_status: "completed",
        intent: "Previous round prompt",
      }],
      next_cursor: null,
    });

    const { container } = renderTimeline("session-1", {
      primaryRoleId: "RenamedPrimary",
    });
    await screen.findByText("Previous round answer");
    const previousGroup = openProcessedGroup(container);
    expect(previousGroup).toHaveAttribute("open");

    act(() => {
      const promptId = useOptimisticRunStore.getState().beginPrompt(
        "session-1",
        "Next round prompt",
      );
      useOptimisticRunStore.getState().confirmPrompt(
        "session-1",
        promptId,
        "opaque-current-run",
      );
      setRuntimeStateFromEvents([
        relayRunEvent({
          event_id: 1,
          event_type: "run_started",
          instance_id: "root-instance-current",
          payload_json: JSON.stringify({ prompt: "Next round prompt" }),
          role_id: "RenamedPrimary",
          run_id: "opaque-current-run",
          trace_id: "opaque-current-run",
        }),
        relayRunEvent({
          event_id: 2,
          event_type: "thinking_delta",
          instance_id: "root-instance-current",
          payload_json: JSON.stringify({ text: "Current round is streaming" }),
          role_id: "RenamedPrimary",
          run_id: "opaque-current-run",
          trace_id: "opaque-current-run",
        }),
      ]);
    });

    expect(await screen.findByText("Next round prompt")).toBeVisible();
    await waitFor(() => expect(
      container.querySelector(
        '[data-run-id="opaque-previous-run"] details.at-processed-group',
      ),
    ).not.toHaveAttribute("open"));
    const currentGroup = container.querySelector(
      '[data-run-id="opaque-current-run"] details.at-processed-group',
    );
    expect(currentGroup).toHaveAttribute("open");
    expect(screen.getByText("Current round is streaming")).toBeVisible();
  });

  it("controls repeated thinking disclosures independently around a subagent card", async () => {
    const onSubagentOpen = vi.fn();
    listSessionMessagesMock.mockResolvedValue([
      {
        message: {
          parts: [
            {
              content: "First independent thought",
              part_kind: "thinking",
            },
            {
              content: {
                subagent_instance_id: "subagent-instance-independent",
                subagent_role_id: "Explorer",
                subagent_run_id: "subagent-run-independent",
                title: "Independent disclosure review",
              },
              part_kind: "tool-return",
              tool_call_id: "call-independent-subagent",
              action_family: "subagent",
              semantic_category: "orchestration",
              tool_name: "spawn_subagent",
            },
            {
              content: "Second independent thought",
              part_kind: "thinking",
            },
            {
              content: "Independent disclosures are ready",
              part_kind: "text",
            },
          ],
        },
        message_id: "assistant-independent-disclosures",
        role_id: "MainAgent",
        run_id: "run-independent-disclosures",
      },
    ]);
    listSessionRoundsMock.mockResolvedValue({
      has_more: false,
      items: [
        {
          created_at: "2026-07-12T09:05:39Z",
          run_id: "run-independent-disclosures",
          run_status: "completed",
          run_user_message: "Check independent thinking disclosures",
        },
      ],
      next_cursor: null,
    });

    const { container } = renderTimeline("session-1", { onSubagentOpen });

    expect(await screen.findByText("Processed")).toBeVisible();
    openProcessedGroup(container);

    const thinkingBlocks = Array.from(
      container.querySelectorAll<HTMLDetailsElement>("details.at-message-thinking"),
    );
    expect(thinkingBlocks).toHaveLength(2);
    const [firstThinking, secondThinking] = thinkingBlocks;
    if (firstThinking === undefined || secondThinking === undefined) {
      throw new Error("Expected two thinking disclosures.");
    }
    const subagentCard = container.querySelector<HTMLDetailsElement>(
      'details.at-message-tool[data-tool-name="spawn_subagent"]',
    );
    expect(subagentCard).not.toBeNull();
    expect(firstThinking).not.toHaveAttribute("open");
    expect(secondThinking).not.toHaveAttribute("open");
    expect(subagentCard).not.toHaveAttribute("open");

    const timeline = container.querySelector<HTMLElement>(".at-timeline");
    if (timeline === null) {
      throw new Error("Timeline scroll owner was not rendered.");
    }
    timeline.scrollTop = 120;

    fireEvent.click(firstThinking.querySelector("summary") as HTMLElement);

    expect(firstThinking).toHaveAttribute("open");
    expect(secondThinking).not.toHaveAttribute("open");
    expect(subagentCard).not.toHaveAttribute("open");
    expect(timeline.scrollTop).toBe(120);

    fireEvent.click(secondThinking.querySelector("summary") as HTMLElement);

    expect(firstThinking).toHaveAttribute("open");
    expect(secondThinking).toHaveAttribute("open");
    expect(subagentCard).not.toHaveAttribute("open");
    expect(timeline.scrollTop).toBe(120);

    fireEvent.click(firstThinking.querySelector("summary") as HTMLElement);

    expect(firstThinking).not.toHaveAttribute("open");
    expect(secondThinking).toHaveAttribute("open");
    expect(subagentCard).not.toHaveAttribute("open");
    expect(timeline.scrollTop).toBe(120);
  });

  it("collapses terminal work-only runs without requiring final answer text", async () => {
    listSessionMessagesMock.mockResolvedValue([
      {
        message: {
          parts: [
            {
              content: "Checking project state",
              part_kind: "thinking",
            },
            {
              args: { path: "C:\\Users\\yex\\Documents\\workspace\\agent-teams" },
              part_kind: "tool-call",
              tool_call_id: "tool-work-only",
              action_family: "read",
              semantic_category: "file-read",
              tool_name: "read",
            },
            {
              content: {
                path: "C:\\Users\\yex\\Documents\\workspace\\agent-teams",
                type: "directory",
              },
              part_kind: "tool-return",
              tool_call_id: "tool-work-only",
              action_family: "read",
              semantic_category: "file-read",
              tool_name: "read",
            },
          ],
        },
        message_id: "assistant-work-only",
        role_id: "MainAgent",
        run_id: "run-work-only",
      },
    ]);
    listSessionRoundsMock.mockResolvedValue({
      has_more: false,
      items: [
        {
          created_at: "2026-06-23T12:42:33Z",
          run_id: "run-work-only",
          run_status: "completed",
          run_user_message: "Inspect workspace only",
        },
      ],
      next_cursor: null,
    });

    const { container } = renderTimeline();

    expect(await screen.findByText("Processed")).toBeVisible();
    const group = container.querySelector("details.at-processed-group");
    expect(group).not.toBeNull();
    expect(group).not.toHaveAttribute("open");
    expect(screen.getByText("Checking project state")).not.toBeVisible();
    expect(screen.getByText("Read: read")).not.toBeVisible();
    expect(container.querySelector("article.at-message")).toBeNull();

    openProcessedGroup(container);

    expect(screen.getByText("Thinking")).toBeVisible();
    expect(screen.getByText("Checking project state")).not.toBeVisible();
    expect(screen.getByText("Read: read")).toBeVisible();
  });

  it("folds intermediate text after completed work while keeping the final answer visible", async () => {
    listSessionMessagesMock.mockResolvedValue([
      {
        content: "Run orchestration with tools",
        message_id: "user-processed-intermediate",
        role: "user",
        run_id: "run-processed-intermediate",
      },
      {
        message: {
          parts: [
            {
              content: "Planning the tool call",
              part_kind: "thinking",
            },
            {
              args: { command: "echo one" },
              part_kind: "tool-call",
              tool_call_id: "tool-intermediate",
              action_family: "run",
              semantic_category: "execution",
              tool_name: "shell",
            },
            {
              content: "one",
              part_kind: "tool-return",
              tool_call_id: "tool-intermediate",
              action_family: "run",
              semantic_category: "execution",
              tool_name: "shell",
            },
          ],
        },
        message_id: "assistant-processed-work",
        role_id: "Coordinator",
        run_id: "run-processed-intermediate",
      },
      {
        content: "Intermediate worker update should be hidden in processed.",
        message_id: "assistant-processed-middle",
        role_id: "Coordinator",
        run_id: "run-processed-intermediate",
      },
      {
        content: "Final answer after work remains visible.",
        message_id: "assistant-processed-final",
        role_id: "Coordinator",
        run_id: "run-processed-intermediate",
      },
    ]);
    listSessionRoundsMock.mockResolvedValue({
      has_more: false,
      items: [
        {
          created_at: "2026-06-23T12:42:33Z",
          run_id: "run-processed-intermediate",
          run_status: "completed",
          run_user_message: "Run orchestration with tools",
        },
      ],
      next_cursor: null,
    });

    const { container } = renderTimeline("session-1", {
      primaryRoleId: "Coordinator",
    });

    expect(await screen.findByText("Final answer after work remains visible."))
      .toBeVisible();
    expect(screen.getAllByText("Run orchestration with tools").length)
      .toBeGreaterThan(0);
    expect(screen.getByText("Intermediate worker update should be hidden in processed."))
      .not.toBeVisible();
    const group = container.querySelector("details.at-processed-group");
    expect(group).not.toBeNull();
    expect(group).not.toHaveAttribute("open");

    openProcessedGroup(container);

    expect(screen.getByText("Intermediate worker update should be hidden in processed."))
      .toBeVisible();
    expect(screen.getByText("Final answer after work remains visible."))
      .toBeVisible();
  });

  it("renders the round rail from session rounds and marks selected rounds", async () => {
    const restoreMeasurements = mockElementMeasurements({
      clientHeight: 220,
      rowHeight: 86,
    });
    const restoreRects = mockTimelineRects();
    try {
      listSessionMessagesMock.mockResolvedValue([
        {
          content: "Initial answer",
          message_id: "assistant-1",
          role_id: "MainAgent",
          trace_id: "run-1",
        },
        {
          content: "Follow-up answer",
          message_id: "assistant-2",
          role_id: "MainAgent",
          trace_id: "run-2",
        },
      ]);
      listSessionRoundsMock.mockResolvedValue({
        has_more: false,
        items: [
          {
            created_at: "2026-06-23T12:42:33Z",
            coordinator_messages: [
              {
                message: {
                  parts: [{ part_kind: "tool-call", tool_name: "read" }],
                  usage: { input_tokens: 1532, output_tokens: 42 },
                },
              },
            ],
            run_id: "run-1",
            run_started_at: "2026-06-23T12:42:50Z",
            run_status: "completed",
            run_updated_at: "2026-06-23T12:42:56Z",
            run_user_message: "Initial task",
          },
          {
            created_at: "2026-06-23T12:43:04Z",
            coordinator_messages: [
              {
                message: {
                  parts: [{ part_kind: "tool-call", tool_name: "shell" }],
                  usage: { input_tokens: 2048, output_tokens: 80 },
                },
              },
            ],
            run_id: "run-2",
            run_status: "completed",
            run_user_message: "Follow-up task",
          },
        ],
        next_cursor: null,
      });

      const { container } = renderTimeline();

      const roundRail = await screen.findByRole("navigation", { name: "Rounds" });
      expect(roundRail).toBeVisible();
      expect(container.querySelector(".at-timeline-frame")).toHaveClass("has-round-rail");
      expect(roundRail.closest(".at-timeline-frame")).toHaveClass("has-round-rail");
      const initialRound = await screen.findByRole("button", {
        name: "Go to round 1: Initial task",
      });
      const followUpRound = await screen.findByRole("button", {
        name: "Go to round 2: Follow-up task",
      });
      expect(followUpRound).toBeVisible();
      expect(container.querySelector('article[data-run-id="run-2"]')).not.toBeNull();
      expect(container.querySelectorAll(".at-round-marker")).toHaveLength(2);
      expect(screen.getAllByText("Input 1.5k")[0]).toBeVisible();
      expect(screen.getAllByText("Tools 1")[0]).toBeVisible();
      expect(screen.getAllByText(/completed/i)[0]).toBeVisible();
      expect(screen.getByText("6s")).toBeVisible();
      expect(listSessionRoundsMock).toHaveBeenCalledWith("session-1", {
        cursorRunId: null,
        forceRefresh: true,
        limit: 100,
      });
      await waitFor(() => expect(followUpRound).toHaveAttribute("aria-current", "step"));
      expect(initialRound).not.toHaveAttribute("aria-current");

      fireEvent.click(initialRound);

      await waitFor(() => expect(initialRound).toHaveAttribute("aria-current", "step"));
      expect(followUpRound).not.toHaveAttribute("aria-current");
      fireEvent.click(followUpRound);

      await waitFor(() => expect(followUpRound).toHaveAttribute("aria-current", "step"));
      expect(initialRound).not.toHaveAttribute("aria-current");
    } finally {
      restoreRects();
      restoreMeasurements();
    }
  });

  it("releases the round rail active lock after the selected round reaches the viewport", async () => {
    const restoreMeasurements = mockElementMeasurements({
      clientHeight: 180,
      rowHeight: 96,
    });
    const restoreRects = mockTimelineRects();
    try {
      listSessionMessagesMock.mockResolvedValue([
        {
          content: "First answer",
          message_id: "assistant-1",
          role_id: "MainAgent",
          trace_id: "run-1",
        },
        {
          content: "Second answer",
          message_id: "assistant-2",
          role_id: "MainAgent",
          trace_id: "run-2",
        },
        {
          content: "Third answer",
          message_id: "assistant-3",
          role_id: "MainAgent",
          trace_id: "run-3",
        },
      ]);
      listSessionRoundsMock.mockResolvedValue({
        has_more: false,
        items: [
          {
            created_at: "2026-06-23T12:42:33Z",
            run_id: "run-1",
            run_status: "completed",
            run_user_message: "First task",
          },
          {
            created_at: "2026-06-23T12:43:04Z",
            run_id: "run-2",
            run_status: "completed",
            run_user_message: "Second task",
          },
          {
            created_at: "2026-06-23T12:44:04Z",
            run_id: "run-3",
            run_status: "completed",
            run_user_message: "Third task",
          },
        ],
        next_cursor: null,
      });

      const { container } = renderTimeline();

      const firstRound = await screen.findByRole("button", {
        name: "Go to round 1: First task",
      });
      const thirdRound = await screen.findByRole("button", {
        name: "Go to round 3: Third task",
      });
      const timeline = timelineElement(container);
      timeline.scrollTop = 0;
      fireEvent.scroll(timeline);
      await waitFor(() => expect(firstRound).toHaveAttribute("aria-current", "step"));

      fireEvent.click(thirdRound);

      await waitFor(() => expect(thirdRound).toHaveAttribute("aria-current", "step"));
      timeline.scrollTop = 0;
      fireEvent.scroll(timeline);
      expect(thirdRound).toHaveAttribute("aria-current", "step");

      const thirdRoundRow = container.querySelector(
        '.at-timeline-row[data-run-id="run-3"]',
      );
      expect(thirdRoundRow).not.toBeNull();
      timeline.scrollTop = translateY(thirdRoundRow);
      fireEvent.scroll(timeline);
      await waitFor(() => expect(thirdRound).toHaveAttribute("aria-current", "step"));

      timeline.scrollTop = 0;
      fireEvent.scroll(timeline);
      await waitFor(() => expect(firstRound).toHaveAttribute("aria-current", "step"));
      expect(thirdRound).not.toHaveAttribute("aria-current");
    } finally {
      restoreRects();
      restoreMeasurements();
    }
  });

  it("collects paged round rail history before sorting and rendering", async () => {
    listSessionMessagesMock.mockResolvedValue([
      {
        content: "Archived answer",
        message_id: "assistant-archive",
        role_id: "MainAgent",
        trace_id: "run-archive",
      },
      {
        content: "Middle answer",
        message_id: "assistant-middle",
        role_id: "MainAgent",
        trace_id: "run-middle",
      },
      {
        content: "Latest answer",
        message_id: "assistant-latest",
        role_id: "MainAgent",
        trace_id: "run-latest",
      },
    ]);
    listSessionRoundsMock
      .mockResolvedValueOnce({
        has_more: true,
        items: [
          {
            created_at: "2026-06-23T12:42:00Z",
            run_id: "run-middle",
            run_status: "completed",
            run_user_message: "Middle stale task",
          },
          {
            created_at: "2026-06-23T12:43:00Z",
            run_id: "run-latest",
            run_status: "completed",
            run_user_message: "Latest task",
          },
        ],
        next_cursor: "run-middle",
      })
      .mockResolvedValueOnce({
        has_more: false,
        items: [
          {
            created_at: "2026-06-23T12:41:00Z",
            run_id: "run-archive",
            run_status: "completed",
            run_user_message: "Archive task",
          },
          {
            created_at: "2026-06-23T12:42:00Z",
            run_id: "run-middle",
            run_status: "completed",
            run_user_message: "Middle updated task",
          },
        ],
        next_cursor: null,
      });

    const { container } = renderTimeline();

    const roundRail = await screen.findByRole("navigation", { name: "Rounds" });
    await waitFor(() => expect(listSessionRoundsMock).toHaveBeenCalledTimes(2));
    expect(listSessionRoundsMock).toHaveBeenNthCalledWith(1, "session-1", {
      cursorRunId: null,
      forceRefresh: true,
      limit: 100,
    });
    expect(listSessionRoundsMock).toHaveBeenNthCalledWith(2, "session-1", {
      cursorRunId: "run-middle",
      forceRefresh: true,
      limit: 100,
    });
    expect(Array.from(roundRail.querySelectorAll("button")).map((button) =>
      button.getAttribute("aria-label"),
    )).toEqual([
      "Go to round 1: Archive task",
      "Go to round 2: Middle updated task",
      "Go to round 3: Latest task",
    ]);
    expect(screen.queryByRole("button", {
      name: "Go to round 2: Middle stale task",
    })).not.toBeInTheDocument();
    expect(container.querySelectorAll(".at-round-marker")).toHaveLength(3);
  });

  it("ignores stale round hydration after switching sessions", async () => {
    const staleRounds = deferredSessionRounds();
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          staleTime: Number.POSITIVE_INFINITY,
        },
      },
    });
    listSessionMessagesMock.mockImplementation((sessionId: string) =>
      Promise.resolve([
        {
          content: `${sessionId} answer`,
          message_id: `${sessionId}-assistant`,
          role_id: "MainAgent",
          trace_id: `${sessionId}-run`,
        },
      ]),
    );
    listSessionRoundsMock.mockImplementation((sessionId: string) => {
      if (sessionId === "session-1") {
        return staleRounds.promise;
      }
      return Promise.resolve({
        has_more: false,
        items: [
          {
            created_at: "2026-06-23T12:44:00Z",
            run_id: "session-2-run",
            run_status: "completed",
            run_user_message: "Fresh session task",
          },
        ],
        next_cursor: null,
      });
    });

    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <ConfigProvider>
          <AntApp>
            <MessageTimeline
              sessionId="session-1"
              runtimeRunId={null}
              workspaceId={null}
            />
          </AntApp>
        </ConfigProvider>
      </QueryClientProvider>,
    );

    await waitFor(() =>
      expect(listSessionRoundsMock).toHaveBeenCalledWith("session-1", {
        cursorRunId: null,
        forceRefresh: true,
        limit: 100,
      }),
    );
    expect(screen.queryByText("session-1 answer")).not.toBeInTheDocument();

    rerender(
      <QueryClientProvider client={queryClient}>
        <ConfigProvider>
          <AntApp>
            <MessageTimeline
              sessionId="session-2"
              runtimeRunId={null}
              workspaceId={null}
            />
          </AntApp>
        </ConfigProvider>
      </QueryClientProvider>,
    );

    expect(await screen.findByText("session-2 answer")).toBeVisible();
    expect(await screen.findByRole("button", {
      name: "Go to round 1: Fresh session task",
    })).toBeVisible();

    await act(async () => {
      staleRounds.resolve({
        has_more: false,
        items: [
          {
            created_at: "2026-06-23T12:41:00Z",
            run_id: "stale-session-1-run",
            run_status: "completed",
            run_user_message: "Stale session task",
          },
        ],
        next_cursor: null,
      });
    });

    expect(screen.getByText("session-2 answer")).toBeVisible();
    expect(screen.queryByText("session-1 answer")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", {
      name: "Go to round 1: Stale session task",
    })).not.toBeInTheDocument();
  });

  it("ignores stale round hydration after switching to no selected session", async () => {
    const staleRounds = deferredSessionRounds();
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          staleTime: Number.POSITIVE_INFINITY,
        },
      },
    });
    listSessionMessagesMock.mockResolvedValue([
      {
        content: "session-1 answer",
        message_id: "session-1-assistant",
        role_id: "MainAgent",
        trace_id: "session-1-run",
      },
    ]);
    listSessionRoundsMock.mockReturnValue(staleRounds.promise);

    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <ConfigProvider>
          <AntApp>
            <MessageTimeline
              sessionId="session-1"
              runtimeRunId={null}
              workspaceId={null}
            />
          </AntApp>
        </ConfigProvider>
      </QueryClientProvider>,
    );

    await waitFor(() =>
      expect(listSessionRoundsMock).toHaveBeenCalledWith("session-1", {
        cursorRunId: null,
        forceRefresh: true,
        limit: 100,
      }),
    );
    expect(screen.queryByText("session-1 answer")).not.toBeInTheDocument();

    rerender(
      <QueryClientProvider client={queryClient}>
        <ConfigProvider>
          <AntApp>
            <MessageTimeline
              sessionId={null}
              runtimeRunId={null}
              workspaceId={null}
            />
          </AntApp>
        </ConfigProvider>
      </QueryClientProvider>,
    );

    expect(await screen.findByText("Select a session")).toBeVisible();

    await act(async () => {
      staleRounds.resolve({
        has_more: false,
        items: [
          {
            created_at: "2026-06-23T12:41:00Z",
            run_id: "stale-session-1-run",
            run_status: "completed",
            run_user_message: "Stale session task",
          },
        ],
        next_cursor: null,
      });
    });

    expect(screen.getByText("Select a session")).toBeVisible();
    expect(screen.queryByText("session-1 answer")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", {
      name: "Go to round 1: Stale session task",
    })).not.toBeInTheDocument();
  });

  it("holds unscoped messages until slow round identity hydration finishes", async () => {
    const slowRounds = deferredSessionRounds();
    listSessionMessagesMock.mockResolvedValue([
      {
        content: "Older answer",
        message_id: "assistant-older",
        role_id: "MainAgent",
        trace_id: "run-1",
      },
      {
        content: "Latest answer",
        message_id: "assistant-latest",
        role_id: "MainAgent",
        trace_id: "run-2",
      },
    ]);
    listSessionRoundsMock.mockReturnValue(slowRounds.promise);

    renderTimeline();

    await waitFor(() => expect(listSessionMessagesMock).toHaveBeenCalled());
    expect(screen.queryByText("Latest answer")).not.toBeInTheDocument();
    expect(screen.queryByText("Older answer")).not.toBeInTheDocument();
    expect(document.querySelector(".ant-skeleton")).not.toBeNull();
    expect(screen.queryByRole("navigation", { name: "Rounds" }))
      .not.toBeInTheDocument();

    await act(async () => {
      slowRounds.resolve({
        has_more: false,
        items: [
          {
            created_at: "2026-06-23T12:41:00Z",
            run_id: "run-1",
            run_status: "completed",
            run_user_message: "Older task",
          },
          {
            created_at: "2026-06-23T12:42:00Z",
            run_id: "run-2",
            run_status: "completed",
            run_user_message: "Latest task",
          },
          {
            created_at: "2026-06-23T12:43:00Z",
            run_id: "run-3",
            run_status: "completed",
            run_user_message: "Newest task",
          },
        ],
        next_cursor: null,
      });
    });

    expect(await screen.findByRole("navigation", { name: "Rounds" }))
      .toBeVisible();
    expect(screen.getByText("Latest answer")).toBeVisible();
    expect(screen.getByText("Older answer")).toBeVisible();
    expect(screen.getByRole("button", { name: "Go to round 1: Older task" }))
      .toBeVisible();
    expect(screen.getByRole("button", { name: "Go to round 3: Newest task" }))
      .toBeVisible();
  });

  it("serializes round rail page fetches through the returned cursor", async () => {
    const firstPage = deferredSessionRounds();
    const secondPage = deferredSessionRounds();
    const pageRequests: Array<{
      cursorRunId: string | null;
      forceRefresh: boolean | undefined;
      sessionId: string;
    }> = [];
    listSessionMessagesMock.mockResolvedValue([
      {
        content: "Older answer",
        message_id: "assistant-older",
        role_id: "MainAgent",
        trace_id: "run-1",
      },
      {
        content: "Latest answer",
        message_id: "assistant-latest",
        role_id: "MainAgent",
        trace_id: "run-2",
      },
    ]);
    listSessionRoundsMock.mockImplementation((sessionId, options = {}) => {
      const cursorRunId = options.cursorRunId ?? null;
      pageRequests.push({ cursorRunId, forceRefresh: options.forceRefresh, sessionId });
      if (cursorRunId === null) {
        return firstPage.promise;
      }
      if (cursorRunId === "run-1") {
        return secondPage.promise;
      }
      return Promise.reject(new Error(`Unexpected cursor: ${cursorRunId}`));
    });

    renderTimeline();

    await waitFor(() => expect(listSessionRoundsMock).toHaveBeenCalledTimes(1));
    expect(screen.queryByText("Latest answer")).not.toBeInTheDocument();
    expect(pageRequests).toEqual([
      { cursorRunId: null, forceRefresh: true, sessionId: "session-1" },
    ]);

    await act(async () => {
      firstPage.resolve({
        has_more: true,
        items: [
          {
            created_at: "2026-06-23T12:41:00Z",
            run_id: "run-1",
            run_status: "completed",
            run_user_message: "Older task",
          },
        ],
        next_cursor: "run-1",
      });
    });

    await waitFor(() => expect(listSessionRoundsMock).toHaveBeenCalledTimes(2));
    expect(pageRequests).toEqual([
      { cursorRunId: null, forceRefresh: true, sessionId: "session-1" },
      { cursorRunId: "run-1", forceRefresh: true, sessionId: "session-1" },
    ]);

    await act(async () => {
      secondPage.resolve({
        has_more: false,
        items: [
          {
            created_at: "2026-06-23T12:42:00Z",
            run_id: "run-2",
            run_status: "completed",
            run_user_message: "Latest task",
          },
        ],
        next_cursor: null,
      });
    });

    expect(await screen.findByRole("button", { name: "Go to round 1: Older task" }))
      .toBeVisible();
    expect(screen.getByText("Latest answer")).toBeVisible();
    expect(screen.getByRole("button", { name: "Go to round 2: Latest task" }))
      .toBeVisible();
  });

  it("replaces stale round rail data after a rounds refresh", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          staleTime: Number.POSITIVE_INFINITY,
        },
      },
    });
    listSessionMessagesMock.mockResolvedValue([
      {
        content: "Newer answer",
        message_id: "assistant-run-2",
        role_id: "MainAgent",
        trace_id: "run-2",
      },
    ]);
    listSessionRoundsMock
      .mockResolvedValueOnce({
        has_more: false,
        items: [
          {
            coordinator_messages: [],
            created_at: "2026-06-23T12:41:00Z",
            has_user_messages: true,
            run_id: "run-1",
            run_status: "completed",
            run_user_message: "approval-only run",
          },
        ],
        next_cursor: null,
      })
      .mockResolvedValueOnce({
        has_more: false,
        items: [
          {
            created_at: "2026-06-23T12:42:00Z",
            run_id: "run-2",
            run_status: "completed",
            run_user_message: "newer",
          },
        ],
        next_cursor: null,
      });

    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <ConfigProvider>
          <AntApp>
            <MessageTimeline
              sessionId="session-1"
              runtimeRunId={null}
              workspaceId={null}
            />
          </AntApp>
        </ConfigProvider>
      </QueryClientProvider>,
    );

    expect(await screen.findByText("Newer answer")).toBeVisible();
    expect(await screen.findByRole("button", {
      name: "Go to round 1: approval-only run",
    })).toBeVisible();
    expect(container.querySelector(".at-round-marker"))
      .toHaveTextContent("approval-only run");

    await act(async () => {
      await queryClient.invalidateQueries({
        queryKey: ["sessions", "session-1", "rounds", "rail"],
      });
    });

    expect(await screen.findByRole("button", { name: "Go to round 1: newer" }))
      .toBeVisible();
    expect(screen.queryByRole("button", {
      name: "Go to round 1: approval-only run",
    })).not.toBeInTheDocument();
    expect(container.querySelector(".at-round-marker")).toHaveTextContent(/completed/i);
    expect(listSessionRoundsMock).toHaveBeenCalledTimes(2);
  });

  it("does not expose unscoped messages when round identity hydration fails", async () => {
    listSessionMessagesMock.mockResolvedValue([
      {
        content: "Recovered answer",
        message_id: "assistant-recovered",
        role_id: "MainAgent",
        trace_id: "run-recovered",
      },
    ]);
    listSessionRoundsMock.mockRejectedValueOnce(new Error("round rail unavailable"));

    renderTimeline();

    await waitFor(() =>
      expect(listSessionRoundsMock).toHaveBeenCalledWith("session-1", {
        cursorRunId: null,
        forceRefresh: true,
        limit: 100,
      }),
    );
    expect(await screen.findByText("Could not load messages")).toBeVisible();
    expect(screen.queryByText("Recovered answer")).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Rounds" }))
      .not.toBeInTheDocument();
  });

  it("does not duplicate round messages that are already in session history", async () => {
    listSessionMessagesMock.mockResolvedValue([
      {
        created_at: "2026-06-23T12:42:34Z",
        message: {
          parts: [{ content: "Persisted shared answer", part_kind: "text" }],
        },
        message_id: "message-shared-answer",
        role_id: "MainAgent",
        run_id: "run-shared",
      },
    ]);
    listSessionRoundsMock.mockResolvedValue({
      has_more: false,
      items: [
        {
          coordinator_messages: [
            {
              created_at: "2026-06-23T12:42:34Z",
              message: {
                parts: [{ content: "Persisted shared answer", part_kind: "text" }],
              },
              role_id: "MainAgent",
            },
          ],
          created_at: "2026-06-23T12:42:33Z",
          run_id: "run-shared",
          run_status: "completed",
          run_user_message: "Shared answer task",
        },
      ],
      next_cursor: null,
    });

    renderTimeline();

    expect(await screen.findByText("Persisted shared answer")).toBeVisible();
    expect(screen.getAllByText("Persisted shared answer")).toHaveLength(1);
  });

  it("does not duplicate processed work when round coordinator messages mirror session history", async () => {
    const thinkingText = "Round mirrored work plan";
    const finalText = "Round mirrored final answer";
    listSessionMessagesMock.mockResolvedValue([
      {
        created_at: "2026-06-23T12:42:34Z",
        message: {
          parts: [
            {
              content: thinkingText,
              part_kind: "thinking",
            },
            {
              args: { path: "src/relay_teams/skills/__init__.py" },
              part_kind: "tool-call",
              tool_call_id: "call-round-mirror",
              action_family: "read",
              semantic_category: "file-read",
              tool_name: "read",
            },
          ],
        },
        message_id: "message-mirrored-work",
        role_id: "MainAgent",
        run_id: "run-round-mirror",
      },
      {
        created_at: "2026-06-23T12:42:35Z",
        message: {
          parts: [
            {
              content: "read complete",
              part_kind: "tool-return",
              tool_call_id: "call-round-mirror",
              action_family: "read",
              semantic_category: "file-read",
              tool_name: "read",
            },
          ],
        },
        message_id: "message-mirrored-result",
        role_id: "MainAgent",
        run_id: "run-round-mirror",
      },
      {
        created_at: "2026-06-23T12:42:36Z",
        message: {
          parts: [{ content: finalText, part_kind: "text" }],
        },
        message_id: "message-mirrored-final",
        role_id: "MainAgent",
        run_id: "run-round-mirror",
      },
    ]);
    listSessionRoundsMock.mockResolvedValue({
      has_more: false,
      items: [
        {
          coordinator_messages: [
            {
              created_at: "2026-06-23T12:42:34Z",
              message: {
                parts: [
                  {
                    content: thinkingText,
                    part_kind: "thinking",
                  },
                  {
                    args: { path: "src/relay_teams/skills/__init__.py" },
                    part_kind: "tool-call",
                    tool_call_id: "call-round-mirror",
                    action_family: "read",
                    semantic_category: "file-read",
                    tool_name: "read",
                  },
                  {
                    content: "read complete",
                    part_kind: "tool-return",
                    tool_call_id: "call-round-mirror",
                    action_family: "read",
                    semantic_category: "file-read",
                    tool_name: "read",
                  },
                  {
                    content: finalText,
                    part_kind: "text",
                  },
                ],
              },
              role_id: "MainAgent",
            },
          ],
          created_at: "2026-06-23T12:42:33Z",
          run_id: "run-round-mirror",
          run_status: "completed",
          run_user_message: "Round mirror check",
        },
      ],
      next_cursor: null,
    });

    const { container } = renderTimeline();

    await waitFor(() =>
      expect(container.textContent ?? "").toContain(finalText),
    );
    const finalArticle = Array.from(container.querySelectorAll("article.at-message"))
      .find((article) => (article.textContent ?? "").includes(finalText));
    expect(finalArticle).not.toBeUndefined();
    expect(finalArticle?.closest(".at-processed-group")).toBeNull();
    expect(container.querySelectorAll(".at-message-thinking")).toHaveLength(1);
    expect(container.querySelectorAll(".at-message-tool")).toHaveLength(1);
    expect(textOccurrenceCount(container.textContent ?? "", thinkingText)).toBe(1);
    expect(textOccurrenceCount(container.textContent ?? "", finalText)).toBe(1);
    expect(screen.getByText("Read: read")).not.toBeVisible();
  });

  it("uses the round marker instead of duplicating the persisted user prompt row", async () => {
    listSessionMessagesMock.mockResolvedValue([
      {
        content: "Run the verification",
        message_id: "user-prompt",
        role: "user",
        run_id: "run-prompt",
      },
      {
        content: "Verification done",
        message_id: "assistant-answer",
        role_id: "MainAgent",
        run_id: "run-prompt",
      },
    ]);
    listSessionRoundsMock.mockResolvedValue({
      has_more: false,
      items: [
        {
          created_at: "2026-06-23T12:42:33Z",
          run_id: "run-prompt",
          run_status: "completed",
          run_user_message: "Run the verification",
        },
      ],
      next_cursor: null,
    });

    const { container } = renderTimeline();

    expect(await screen.findByText("Verification done")).toBeVisible();
    expect(container.querySelector(".at-round-marker"))
      .toHaveTextContent("Run the verification");
    expect(container.querySelector('article.at-message[data-role-id="user"]'))
      .toBeNull();
  });

  it("uses the round marker instead of duplicating localized persisted user prompts", async () => {
    listSessionMessagesMock.mockResolvedValue([
      {
        content: "你好 连续修复验证 五轮 3",
        message_id: "localized-user-prompt",
        role_id: "用户",
        run_id: "run-localized-prompt",
      },
      {
        content: "第三轮修复验证。",
        message_id: "localized-assistant-answer",
        role_id: "MainAgent",
        run_id: "run-localized-prompt",
      },
    ]);
    listSessionRoundsMock.mockResolvedValue({
      has_more: false,
      items: [
        {
          created_at: "2026-06-23T12:42:33Z",
          run_id: "run-localized-prompt",
          run_status: "completed",
          run_user_message: "你好 连续修复验证 五轮 3",
        },
      ],
      next_cursor: null,
    });

    const { container } = renderTimeline();

    expect(await screen.findByText("第三轮修复验证。")).toBeVisible();
    expect(container.querySelector(".at-round-marker"))
      .toHaveTextContent("你好 连续修复验证 五轮 3");
    expect(container.querySelector('article.at-message[data-role-id="用户"]'))
      .toBeNull();
  });

  it("renders a runtime-only round marker before visible stream content arrives", async () => {
    setRuntimeEntries([], "open", {
      createdAt: "2026-06-23T12:42:33Z",
      promptText: "Live stream prompt",
      sessionId: "session-1",
    });
    listSessionMessagesMock.mockResolvedValue([]);

    const { container } = renderTimeline();

    expect(await screen.findByText("Live stream prompt")).toBeVisible();
    expect(container.querySelector(".at-round-marker")).toHaveTextContent(/running/i);
    expect(container.querySelectorAll("article.at-message")).toHaveLength(0);
  });

  it("restores a queued session prompt when switching back before its first token", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
      },
    });
    listSessionMessagesMock.mockResolvedValue([]);
    useRuntimeStore.setState({
      runtimeState: {
        activeRunIds: ["run-session-1", "run-session-2"],
        runs: {
          "run-session-1": {
            entries: [],
            lastEventId: 0,
            promptText: "Queued prompt for session one",
            runId: "run-session-1",
            seenEventKeys: [],
            sessionId: "session-1",
            status: "connecting",
            terminalEventType: null,
          },
          "run-session-2": {
            entries: [],
            lastEventId: 0,
            promptText: "Queued prompt for session two",
            runId: "run-session-2",
            seenEventKeys: [],
            sessionId: "session-2",
            status: "connecting",
            terminalEventType: null,
          },
        },
      },
    });

    const view = render(
      <QueryClientProvider client={queryClient}>
        <ConfigProvider>
          <AntApp>
            <MessageTimeline sessionId="session-2" />
          </AntApp>
        </ConfigProvider>
      </QueryClientProvider>,
    );

    expect(await screen.findByText("Queued prompt for session two")).toBeVisible();
    expect(screen.queryByText("Queued prompt for session one"))
      .not.toBeInTheDocument();

    view.rerender(
      <QueryClientProvider client={queryClient}>
        <ConfigProvider>
          <AntApp>
            <MessageTimeline sessionId="session-1" />
          </AntApp>
        </ConfigProvider>
      </QueryClientProvider>,
    );

    expect(await screen.findByText("Queued prompt for session one")).toBeVisible();
    expect(screen.queryByText("Queued prompt for session two"))
      .not.toBeInTheDocument();
  });

  it("does not downgrade terminal round markers with stale open runtime state", async () => {
    setRuntimeEntries([], "open", {
      createdAt: "2026-06-23T12:42:33Z",
      promptText: "Terminal prompt",
      sessionId: "session-1",
    });
    listSessionMessagesMock.mockResolvedValue([
      {
        content: "Terminal answer",
        message_id: "assistant-terminal-answer",
        role_id: "MainAgent",
        run_id: "run-output",
      },
    ]);
    listSessionRoundsMock.mockResolvedValue({
      has_more: false,
      items: [
        {
          created_at: "2026-06-23T12:42:33Z",
          run_id: "run-output",
          run_status: "completed",
          run_user_message: "Terminal prompt",
        },
      ],
      next_cursor: null,
    });

    const { container } = renderTimeline();

    expect(await screen.findByText("Terminal answer")).toBeVisible();
    await waitFor(() => {
      const roundMarker = container.querySelector(".at-round-marker");
      expect(roundMarker).toHaveTextContent(/completed/i);
      expect(roundMarker).not.toHaveTextContent(/running/i);
    });
  });

  it("shows a pending runtime cursor row while waiting for first content", async () => {
    setRuntimeEntries(
      [
        runtimeGenericEntry({
          id: "run-output:1:0",
          kind: "run_started",
          text: "run started",
          eventId: 1,
          payload: {},
        }),
      ],
      "open",
      {
        promptText: "Waiting for first token",
        sessionId: "session-1",
      },
    );
    listSessionMessagesMock.mockResolvedValue([]);

    const { container } = renderTimeline();

    expect(await screen.findByText("Waiting for first token")).toBeVisible();
    expect(container.querySelectorAll("article.at-message")).toHaveLength(1);
    expect(container.querySelector(".at-message-streaming-text")).not.toBeNull();
    expect(container.querySelectorAll(".streaming-cursor")).toHaveLength(1);
    expect(screen.queryByText("run started")).not.toBeInTheDocument();
  });

  it("hides internal successful status events after the final runtime answer", async () => {
    setRuntimeEntries(
      [
        runtimeTextDeltaEntry({
          id: "run-output:1:0",
          text: "Final answer",
          eventId: 1,
        }),
        runtimeGenericEntry({
          id: "run-output:2:1",
          kind: "spec_checkpoint_evaluated",
          text: "passed",
          eventId: 2,
          payload: { status: "passed" },
        }),
        runtimeGenericEntry({
          id: "run-output:3:2",
          kind: "hook_completed",
          text: "completed",
          eventId: 3,
          payload: { status: "completed" },
        }),
        runtimeGenericEntry({
          id: "run-output:4:3",
          kind: "runtime_guardrail_report",
          text: "passed",
          eventId: 4,
          payload: {
            blocked_count: 0,
            status: "passed",
            warning_count: 0,
          },
        }),
      ],
      "closed",
      {
        promptText: "Run with internal status events",
        sessionId: "session-1",
      },
    );
    listSessionMessagesMock.mockResolvedValue([]);

    renderTimeline();

    expect(await screen.findByText("Final answer")).toBeVisible();
    expect(screen.queryByText("passed")).not.toBeInTheDocument();
    expect(screen.queryByText("completed")).not.toBeInTheDocument();
  });

  it("keeps long round prompts collapsed with raw text available in the marker", async () => {
    const prompt = [
      "Create a migration plan for the frontend rewrite.",
      "Keep the settings navigation aligned with V1.",
      "Do not flatten secondary screens into the first-level workspace.",
    ].join("\n");
    listSessionMessagesMock.mockResolvedValue([
      {
        content: "Plan ready",
        message_id: "assistant-1",
        role_id: "MainAgent",
        trace_id: "run-long",
      },
    ]);
    listSessionRoundsMock.mockResolvedValue({
      has_more: false,
      items: [
        {
          created_at: "2026-06-23T12:42:33Z",
          run_id: "run-long",
          run_status: "completed",
          run_user_message: prompt,
        },
      ],
      next_cursor: null,
    });

    const { container } = renderTimeline();

    expect(await screen.findByText("Plan ready")).toBeVisible();
    const marker = container.querySelector(".at-round-marker-intent");
    expect(marker).not.toBeNull();
    expect(marker).toHaveAttribute("data-open", "false");
    const toggle = marker?.querySelector(".at-round-prompt-toggle");
    expect(toggle).not.toBeNull();
    expect(marker?.querySelector(".at-round-prompt-body")).toHaveTextContent(
      "Create a migration plan for the frontend rewrite. Keep the settings navigation aligned with V1.",
    );
    const action = marker?.querySelector(".at-round-marker-intent-action");
    expect(action?.textContent).toBe("Expand");
    expect(marker?.querySelector(".at-round-prompt-body")).toHaveClass("is-collapsed");

    fireEvent.click(toggle as Element);

    expect(marker).toHaveAttribute("data-open", "true");
    expect(marker?.querySelector(".at-round-marker-intent-action")?.textContent)
      .toBe("Collapse");
    const body = marker?.querySelector(".at-round-prompt-body");
    expect(body).toHaveTextContent("Keep the settings navigation aligned with V1.");
    expect(body?.textContent).toContain("\nDo not flatten secondary screens");
    expect(toggle).not.toHaveTextContent(
      "Create a migration plan for the frontend rewrite.",
    );
  });

  it("collapses one-line round prompts before the marker title becomes unreadable", async () => {
    const prompt =
      "问题工具位置验证-1782803930917：请使用 ask_question 工具问我一个问题，问题内容是“请选择一个方向？”，不要直接给最终回答。";
    listSessionMessagesMock.mockResolvedValue([
      {
        content: "已提问“请选择一个方向？”，用户选择了方向A。",
        message_id: "assistant-1",
        role_id: "MainAgent",
        trace_id: "run-question",
      },
    ]);
    listSessionRoundsMock.mockResolvedValue({
      has_more: false,
      items: [
        {
          created_at: "2026-06-23T12:42:33Z",
          run_id: "run-question",
          run_status: "completed",
          run_user_message: prompt,
        },
      ],
      next_cursor: null,
    });

    const { container } = renderTimeline();

    expect(await screen.findByText("已提问“请选择一个方向？”，用户选择了方向A。"))
      .toBeVisible();
    const marker = container.querySelector(".at-round-marker-intent");
    expect(marker).not.toBeNull();
    expect(marker).toHaveAttribute("data-open", "false");
    expect(marker?.querySelector(".at-round-marker-intent-action"))
      .toHaveTextContent(/^Expand$/);
    const toggle = marker?.querySelector(".at-round-prompt-toggle");
    fireEvent.click(toggle as Element);
    expect(marker).toHaveAttribute("data-open", "true");
    expect(marker?.querySelector(".at-round-marker-intent-action"))
      .toHaveTextContent(/^Collapse$/);
    expect(toggle).toHaveTextContent(/^Collapse$/);
    expect(toggle).not.toHaveTextContent(prompt);
    expect(marker?.querySelector(".at-round-prompt-body")).toHaveTextContent(prompt);
    expect(toggle).not.toHaveTextContent("问题工具位置验证-1782803930917");
    expect(
      textOccurrenceCount(container.querySelector(".at-round-marker")?.textContent ?? "", prompt),
    ).toBe(1);
    expect(
      textOccurrenceCount(
        container.querySelector(".at-round-marker")?.textContent ?? "",
        "问题工具位置验证-1782803930917",
      ),
    ).toBe(1);
  });

  it("shows terminal runtime status when a persisted round status is stale", async () => {
    listSessionMessagesMock.mockResolvedValue([
      {
        content: "Final recovered answer",
        message_id: "assistant-1",
        role_id: "MainAgent",
        trace_id: "run-output",
      },
    ]);
    listSessionRoundsMock.mockResolvedValue({
      has_more: false,
      items: [
        {
          created_at: "2026-06-23T12:42:33Z",
          run_id: "run-output",
          run_phase: "streaming",
          run_status: "running",
          run_user_message: "Recovered stream task",
        },
      ],
      next_cursor: null,
    });
    useRuntimeStore.setState({
      runtimeState: {
        activeRunIds: [],
        runs: {
          "run-output": {
            entries: [
              runtimeGenericEntry({
                eventId: 2,
                id: "run-output:2:0",
                kind: "run_completed",
                payload: { status: "completed" },
                text: "run completed",
              }),
            ],
            lastEventId: 2,
            runId: "run-output",
            seenEventKeys: ["run-output:2"],
            status: "closed",
            terminalEventType: "run_completed",
          },
        },
      },
    });

    const { container } = renderTimeline();

    expect(await screen.findByText("Final recovered answer")).toBeVisible();
    const marker = container.querySelector(".at-round-marker");
    expect(marker).not.toBeNull();
    expect(marker).toHaveTextContent(/completed/i);
    expect(marker).not.toHaveTextContent(/running/i);
    expect(marker).not.toHaveTextContent(/streaming/i);
  });

  it("uses latest session terminal status when reload leaves a persisted round running", async () => {
    listSessionMessagesMock.mockResolvedValue([
      {
        content: "Recovered after reload.",
        message_id: "assistant-1",
        role_id: "MainAgent",
        trace_id: "run-output",
      },
    ]);
    listSessionRoundsMock.mockResolvedValue({
      has_more: false,
      items: [
        {
          created_at: "2026-06-23T12:42:33Z",
          run_id: "run-output",
          run_phase: "running",
          run_status: "running",
          run_user_message: "Recovered reload task",
        },
      ],
      next_cursor: null,
    });
    useRuntimeStore.setState({
      runtimeState: {
        activeRunIds: [],
        runs: {},
      },
    });

    const { container } = renderTimeline("session-1", {
      latestTerminalRunId: "run-output",
      latestTerminalRunStatus: "completed",
    });

    expect(await screen.findByText("Recovered after reload.")).toBeVisible();
    const marker = container.querySelector(".at-round-marker");
    expect(marker).not.toBeNull();
    expect(marker).toHaveTextContent(/completed/i);
    expect(marker).not.toHaveTextContent(/running/i);
  });

  it("refreshes live rounds only after terminal activity invalidates history", async () => {
    listSessionMessagesMock.mockResolvedValue([
      {
        content: "Finished after refresh.",
        message_id: "assistant-1",
        role_id: "MainAgent",
        trace_id: "run-output",
      },
    ]);
    listSessionRoundsMock
      .mockResolvedValueOnce({
        has_more: false,
        items: [
          {
            created_at: "2026-06-23T12:42:33Z",
            run_id: "run-output",
            run_phase: null,
            run_status: "running",
            run_user_message: "Refresh running task",
          },
        ],
        next_cursor: null,
      })
      .mockResolvedValueOnce({
        has_more: false,
        items: [
          {
            created_at: "2026-06-23T12:42:33Z",
            run_id: "run-output",
            run_phase: null,
            run_status: "completed",
            run_user_message: "Refresh running task",
          },
        ],
        next_cursor: null,
      });

    const { container, queryClient } = renderTimeline();

    await waitFor(() =>
      expect(container).toHaveTextContent("Finished after refresh."),
    );
    expect(container.querySelector(".at-round-marker-meta")).toHaveTextContent(/running/i);
    expect(listSessionRoundsMock).toHaveBeenCalledTimes(1);
    await act(async () => {
      await queryClient.invalidateQueries({
        queryKey: ["sessions", "session-1", "rounds"],
      });
    });
    expect(listSessionRoundsMock).toHaveBeenCalledTimes(2);
    await waitFor(() => {
      const markerMeta = container.querySelector(".at-round-marker-meta");
      expect(markerMeta).toHaveTextContent(/completed/i);
      expect(markerMeta).not.toHaveTextContent(/running/i);
    });
  });

  it("keeps terminal runtime status when stale round hydration resolves later", async () => {
    const staleRounds = deferredSessionRounds();
    listSessionMessagesMock.mockResolvedValue([
      {
        content: "Final answer after background hydration.",
        message_id: "assistant-1",
        role_id: "MainAgent",
        trace_id: "run-output",
      },
    ]);
    listSessionRoundsMock.mockReturnValue(staleRounds.promise);
    useRuntimeStore.setState({
      runtimeState: {
        activeRunIds: [],
        runs: {
          "run-output": {
            entries: [
              runtimeGenericEntry({
                eventId: 2,
                id: "run-output:2:0",
                kind: "run_completed",
                payload: { status: "completed" },
                text: "run completed",
              }),
            ],
            lastEventId: 2,
            runId: "run-output",
            seenEventKeys: ["run-output:2"],
            status: "closed",
            terminalEventType: "run_completed",
          },
        },
      },
    });

    const { container } = renderTimeline();

    await waitFor(() =>
      expect(container).toHaveTextContent("Final answer after background hydration."),
    );
    await waitFor(() =>
      expect(listSessionRoundsMock).toHaveBeenCalledWith("session-1", {
        cursorRunId: null,
        forceRefresh: true,
        limit: 100,
      }),
    );

    await act(async () => {
      staleRounds.resolve({
        has_more: false,
        items: [
          {
            created_at: "2026-06-23T12:42:33Z",
            run_id: "run-output",
            run_phase: "running",
            run_status: "running",
            run_user_message: "Recovered stream task",
          },
        ],
        next_cursor: null,
      });
    });

    const marker = await waitFor(() => {
      const currentMarker = container.querySelector(".at-round-marker");
      expect(currentMarker).not.toBeNull();
      return currentMarker as HTMLElement;
    });
    expect(marker).toHaveTextContent(/completed/i);
    expect(marker).not.toHaveTextContent(/running/i);
  });

  it("surfaces round pending actions, retry details, and diagnostics", async () => {
    listSessionMessagesMock.mockResolvedValue([
      {
        content: "Needs follow-up",
        message_id: "assistant-1",
        role_id: "MainAgent",
        trace_id: "run-1",
      },
    ]);
    listSessionRoundsMock.mockResolvedValue({
      has_more: false,
      items: [
        {
          created_at: "2026-06-23T12:42:33Z",
          pending_tool_approval_count: 2,
          pending_user_question_count: 1,
          microcompact: {
            applied: true,
            compacted_message_count: 3,
            compacted_part_count: 7,
            estimated_tokens_before: 9800,
            estimated_tokens_after: 3200,
          },
          retry_events: [
            {
              attempt_number: 3,
              error_message: "rate limited",
              is_active: true,
              phase: "scheduled",
              retry_in_ms: 2500,
              total_attempts: 5,
            },
          ],
          run_diagnostic_message: "Waiting for user confirmation",
          run_id: "run-1",
          run_status: "paused",
          run_user_message: "Approve deployment",
          todo: {
            items: [
              { content: "Confirm deploy window", status: "in_progress" },
              { content: "Capture approval result", status: "pending" },
            ],
            run_id: "run-1",
            session_id: "session-1",
            version: 2,
          },
        },
      ],
      next_cursor: null,
    });

    const { container } = renderTimeline();

    await waitFor(() => expect(screen.getAllByText("2 pending approvals")).toHaveLength(2));
    expect(screen.getAllByText("1 pending questions")).toHaveLength(2);
    expect(screen.getAllByText("Retry scheduled: attempt 3/5 · in 3s · rate limited"))
      .toHaveLength(2);
    expect(screen.getAllByText("Microcompact 9.8k -> 3.2k")).toHaveLength(2);
    expect(screen.getAllByText("Diagnostic: Waiting for user confirmation"))
      .toHaveLength(2);
    expect(screen.getByRole("button", { name: "Go to round 1: Approve deployment" }))
      .toHaveClass("is-warning");
    const detail = screen.getByLabelText("Round detail");
    expect(detail).toHaveTextContent("Todo");
    expect(detail).toHaveTextContent("2 items");
    expect(detail).toHaveTextContent("Confirm deploy window");
    expect(detail).toHaveTextContent("In progress");
    expect(detail).toHaveTextContent("Capture approval result");
    expect(detail).toHaveTextContent("Pending");
    expect(container.querySelector(".at-round-rail-dot")).not.toBeNull();
  });

  it("renders active retrying rounds with stable warning metadata", async () => {
    listSessionMessagesMock.mockResolvedValue([
      {
        content: "Retry attempt is in progress.",
        message_id: "assistant-retry-active",
        role_id: "MainAgent",
        trace_id: "retry-run-1",
      },
    ]);
    listSessionRoundsMock.mockResolvedValue({
      has_more: false,
      items: [
        {
          created_at: "2026-06-23T12:42:33Z",
          retry_events: [
            {
              attempt_number: 2,
              error_code: "rate_limit",
              is_active: true,
              kind: "retry",
              phase: "retrying",
              retry_in_ms: 1000,
              total_attempts: 6,
            },
          ],
          run_id: "retry-run-1",
          run_status: "running",
          run_user_message: "Retry active provider call",
        },
      ],
      next_cursor: null,
    });

    const { container } = renderTimeline();

    await waitFor(() =>
      expect(container).toHaveTextContent("Retry attempt is in progress."),
    );
    expect(screen.getAllByText("Retrying: attempt 2/6 · in 1s · rate_limit"))
      .toHaveLength(2);
    expect(
      screen.getByRole("button", { name: "Go to round 1: Retry active provider call" }),
    ).toHaveClass("is-warning");
    expect(container.querySelector(".at-round-marker")).toHaveTextContent(/running/i);
  });

  it("hides raw verification diagnostics in round markers until diagnostics are visible", async () => {
    const rawDiagnostic = "verification_failedruntime_guardrail:pre_execution_boundary";
    listSessionMessagesMock.mockResolvedValue([
      {
        content: "Verification kept the previous answer.",
        message_id: "assistant-1",
        role_id: "MainAgent",
        trace_id: "run-1",
      },
    ]);
    listSessionRoundsMock.mockResolvedValue({
      has_more: false,
      items: [
        {
          created_at: "2026-06-23T12:42:33Z",
          run_diagnostic_message: rawDiagnostic,
          run_id: "run-1",
          run_status: "completed",
          run_user_message: "Run verification",
          verification_status: "failed",
        },
      ],
      next_cursor: null,
    });

    const { container } = renderTimeline();

    expect(await screen.findByText("Verification kept the previous answer."))
      .toBeVisible();
    expect(screen.getAllByText("Diagnostic: Verification not passed."))
      .toHaveLength(2);
    expect(screen.queryByText(new RegExp(rawDiagnostic))).not.toBeInTheDocument();
    expect(container.querySelector(".at-round-marker")).toHaveTextContent(
      /verification failed/i,
    );
  });

  it("shows raw verification diagnostics when diagnostics are visible", async () => {
    const rawDiagnostic = "verification_failedruntime_guardrail:pre_execution_boundary";
    document.documentElement.dataset.diagnosticsVisible = "true";
    listSessionMessagesMock.mockResolvedValue([
      {
        content: "Verification kept the previous answer.",
        message_id: "assistant-1",
        role_id: "MainAgent",
        trace_id: "run-1",
      },
    ]);
    listSessionRoundsMock.mockResolvedValue({
      has_more: false,
      items: [
        {
          created_at: "2026-06-23T12:42:33Z",
          run_diagnostic_message: rawDiagnostic,
          run_id: "run-1",
          run_status: "completed",
          run_user_message: "Run verification",
          verification_status: "failed",
        },
      ],
      next_cursor: null,
    });

    renderTimeline();

    expect(await screen.findByText("Verification kept the previous answer."))
      .toBeVisible();
    expect(screen.getAllByText(`Diagnostic: ${rawDiagnostic}`)).toHaveLength(2);
    expect(screen.queryByText("Diagnostic: Verification not passed."))
      .not.toBeInTheDocument();
  });

  it("projects live retry events into round summaries and clears them after completion", async () => {
    listSessionMessagesMock.mockResolvedValue([
      {
        content: "Retrying model call",
        message_id: "assistant-retry",
        role_id: "MainAgent",
        trace_id: "run-output",
      },
    ]);
    listSessionRoundsMock.mockResolvedValue({
      has_more: false,
      items: [
        {
          created_at: "2026-06-23T12:42:33Z",
          run_id: "run-output",
          run_status: "running",
          run_user_message: "Retry streaming answer",
        },
      ],
      next_cursor: null,
    });
    setRuntimeEntries([
      runtimeGenericEntry({
        eventId: 1,
        id: "run-output:1:0",
        kind: "llm_retry_scheduled",
        payload: {
          attempt_number: 2,
          error_message: "busy",
          retry_in_ms: 1000,
          total_attempts: 6,
        },
        text: "busy",
      }),
    ], "open");

    const { container } = renderTimeline();

    await waitFor(() =>
      expect(screen.getAllByText("Retry scheduled: attempt 2/6 · in 1s · busy"))
        .toHaveLength(2),
    );
    expect(screen.getByRole("button", { name: "Go to round 1: Retry streaming answer" }))
      .toHaveClass("is-warning");

    act(() => {
      setRuntimeEntries([
        runtimeGenericEntry({
          eventId: 1,
          id: "run-output:1:0",
          kind: "llm_retry_scheduled",
          payload: {
            attempt_number: 2,
            error_message: "busy",
            retry_in_ms: 1000,
            total_attempts: 6,
          },
          text: "busy",
        }),
        runtimeGenericEntry({
          eventId: 2,
          id: "run-output:2:1",
          kind: "run_completed",
          payload: { status: "completed" },
          text: "run completed",
        }),
      ], "closed");
    });

    await waitFor(() =>
      expect(screen.queryByText("Retry scheduled: attempt 2/6 · in 1s · busy"))
        .not.toBeInTheDocument(),
    );
    const marker = container.querySelector(".at-round-marker");
    expect(marker).not.toBeNull();
    expect(marker).toHaveTextContent(/completed/i);
  });

  it("renders live fallback targets as safe round metadata", async () => {
    const unsafeTarget = "<img src=x onerror=alert(1)>";
    listSessionMessagesMock.mockResolvedValue([
      {
        content: "Fallback model is now active.",
        message_id: "assistant-fallback",
        role_id: "MainAgent",
        trace_id: "run-output",
      },
    ]);
    listSessionRoundsMock.mockResolvedValue({
      has_more: false,
      items: [
        {
          created_at: "2026-06-23T12:42:33Z",
          run_id: "run-output",
          run_status: "running",
          run_user_message: "Switch model after provider failure",
        },
      ],
      next_cursor: null,
    });
    setRuntimeEntries([
      runtimeGenericEntry({
        eventId: 1,
        id: "run-output:1:0",
        kind: "llm_fallback_activated",
        payload: {
          phase: "fallback",
          to_profile_id: unsafeTarget,
        },
        text: "fallback activated",
      }),
    ], "open");

    const { container } = renderTimeline();

    await waitForSingleVisibleText("Fallback model is now active.");
    await waitFor(() => {
      expect(screen.getAllByText(`Fallback: to ${unsafeTarget}`)).toHaveLength(2);
    });
    expect(container.querySelector("img")).toBeNull();
    await waitFor(() => {
      expect(screen.getByRole("button", {
        name: "Go to round 1: Switch model after provider failure",
      })).toHaveClass("is-warning");
    });
  });

  it("collapses round history before a clear marker and expands it on demand", async () => {
    listSessionMessagesMock.mockResolvedValue([
      {
        content: "Archived answer",
        message_id: "assistant-archived",
        role_id: "MainAgent",
        trace_id: "run-archived",
      },
      {
        content: "Current answer",
        message_id: "assistant-current",
        role_id: "MainAgent",
        trace_id: "run-current",
      },
    ]);
    listSessionRoundsMock.mockResolvedValue({
      has_more: false,
      items: [
        {
          created_at: "2026-06-23T12:40:00Z",
          run_id: "run-archived",
          run_status: "completed",
          run_user_message: "Archived task",
        },
        {
          clear_marker_before: { cleared_at: "2026-06-23T12:42:00Z" },
          created_at: "2026-06-23T12:42:00Z",
          run_id: "run-current",
          run_status: "completed",
          run_user_message: "Current task",
        },
      ],
      next_cursor: null,
    });

    const { container } = renderTimeline();

    expect(await screen.findByText("Current answer")).toBeVisible();
    expect(screen.getByText("History cleared")).toBeVisible();
    const showHistory = screen.getByRole("button", {
      name: /Show history before Current task/,
    });
    expect(showHistory).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("Rounds 1 · messages 1 hidden before Current task"))
      .toBeVisible();
    expect(screen.queryByText("Archived answer")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Go to round 1: Archived task" }),
    ).not.toBeInTheDocument();
    expect(container.querySelectorAll(".at-history-divider")).toHaveLength(1);

    fireEvent.click(showHistory);

    expect(await screen.findByText("Archived answer")).toBeVisible();
    expect(screen.getByRole("button", { name: "Go to round 1: Archived task" }))
      .toBeVisible();
    expect(screen.getByRole("button", { name: /Hide history before Current task/ }))
      .toHaveAttribute("aria-expanded", "true");
  });

  it("deduplicates round transcript messages across collapsed history", async () => {
    listSessionMessagesMock.mockResolvedValue([
      {
        content: "Archived shared transcript",
        created_at: "2026-06-23T12:40:30Z",
        message_id: "assistant-archived-shared",
        role_id: "MainAgent",
        trace_id: "run-archived",
      },
      {
        content: "Current shared transcript",
        created_at: "2026-06-23T12:42:30Z",
        message_id: "assistant-current-shared",
        role_id: "MainAgent",
        trace_id: "run-current",
      },
    ]);
    listSessionRoundsMock.mockResolvedValue({
      has_more: false,
      items: [
        {
          coordinator_messages: [
            {
              content: "Archived shared transcript",
              created_at: "2026-06-23T12:40:30Z",
              entry_type: "message",
              message_id: "assistant-archived-shared",
              role_id: "MainAgent",
            },
          ],
          created_at: "2026-06-23T12:40:00Z",
          run_id: "run-archived",
          run_status: "completed",
          run_user_message: "Archived task",
        },
        {
          clear_marker_before: { cleared_at: "2026-06-23T12:42:00Z" },
          coordinator_messages: [
            {
              content: "Current shared transcript",
              created_at: "2026-06-23T12:42:30Z",
              entry_type: "message",
              message_id: "assistant-current-shared",
              role_id: "MainAgent",
            },
          ],
          created_at: "2026-06-23T12:42:00Z",
          run_id: "run-current",
          run_status: "completed",
          run_user_message: "Current task",
        },
      ],
      next_cursor: null,
    });

    const { container } = renderTimeline();

    expect(await screen.findByText("Current shared transcript")).toBeVisible();
    expect(screen.getAllByText("Current shared transcript")).toHaveLength(1);
    expect(screen.getByText("Rounds 1 · messages 1 hidden before Current task"))
      .toBeVisible();
    expect(screen.queryByText("Archived shared transcript")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", {
      name: /Show history before Current task/,
    }));

    expect(await screen.findByText("Archived shared transcript")).toBeVisible();
    expect(screen.getAllByText("Archived shared transcript")).toHaveLength(1);
    const rowTexts = Array.from(container.querySelectorAll("article.at-message"))
      .map((row) => row.textContent ?? "");
    expect(rowTexts.filter((text) => text.includes("Archived shared transcript")))
      .toHaveLength(1);
    expect(rowTexts.filter((text) => text.includes("Current shared transcript")))
      .toHaveLength(1);
  });

  it("keeps running reconstructed round output in the streaming row", async () => {
    listSessionMessagesMock.mockResolvedValue([]);
    listSessionRoundsMock.mockResolvedValue({
      has_more: false,
      items: [
        {
          coordinator_messages: [
            {
              created_at: "2026-06-23T12:42:30Z",
              instance_id: "main-instance",
              role: "assistant",
              role_id: "MainAgent",
              message: {
                parts: [
                  {
                    content: "partial reconstructed stream",
                    part_kind: "text",
                  },
                ],
              },
            },
          ],
          created_at: "2026-06-23T12:42:00Z",
          primary_role_id: "MainAgent",
          run_id: "run-reconstructed-running",
          run_phase: "running",
          run_status: "running",
          run_user_message: "Streaming task",
        },
      ],
      next_cursor: null,
    });

    const { container } = renderTimeline();

    await waitForSingleVisibleText("partial reconstructed stream");
    const article = container.querySelector<HTMLElement>("article.at-message");
    expect(article).not.toBeNull();
    expect(article).toHaveClass("is-streaming");
    expect(article).toHaveAttribute("data-run-id", "run-reconstructed-running");
    const streamingText = container.querySelector<HTMLElement>(
      ".at-message-streaming-text",
    );
    expect(streamingText).not.toBeNull();
    expect(streamingText).toHaveTextContent("partial reconstructed stream");
    expect(container.querySelectorAll(".streaming-cursor")).toHaveLength(1);
  });

  it("keeps the round rail visible for single-round sessions like V1", async () => {
    listSessionMessagesMock.mockResolvedValue([
      {
        content: "Only answer",
        message_id: "assistant-1",
        role_id: "MainAgent",
        trace_id: "run-1",
      },
    ]);
    listSessionRoundsMock.mockResolvedValue({
      has_more: false,
      items: [
        {
          created_at: "2026-06-23T12:42:33Z",
          run_id: "run-1",
          run_status: "completed",
          run_user_message: "Single task",
        },
      ],
      next_cursor: null,
    });

    const { container } = renderTimeline();

    expect(await screen.findByText("Only answer")).toBeVisible();
    await waitFor(() => {
      expect(container.querySelectorAll(".at-round-marker")).toHaveLength(1);
    });
    expect(container.querySelector(".at-timeline-frame")).toHaveClass("has-round-rail");
    expect(await screen.findByRole("navigation", { name: "Rounds" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Go to round 1: Single task" })).toHaveAttribute(
      "aria-current",
      "step",
    );
  });

  it("does not copy stale runtime delta chunks over hydrated answers", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    useRuntimeStore.setState({
      runtimeState: {
        activeRunIds: [],
        runs: {
          "run-1": {
            runId: "run-1",
            status: "closed",
            lastEventId: 5,
            seenEventKeys: [],
            terminalEventType: "run_completed",
            entries: [
              {
                id: "run-1:4:0",
                sessionId: "session-1",
                runId: "run-1",
                roleId: "MainAgent",
                kind: "text_delta",
                text: "final chunk only",
                payload: { text: "final chunk only" },
                eventId: 4,
                occurredAt: "2026-06-23T00:00:00Z",
              },
            ],
          },
        },
      },
    });
    listSessionMessagesMock.mockResolvedValue([
      {
        agent_role_id: "MainAgent",
        message_id: "assistant-1",
        role: "assistant",
        role_id: "MainAgent",
        trace_id: "run-1",
        content: "Full persisted answer",
      },
    ]);

    renderTimeline();

    await waitForSingleVisibleText("Full persisted answer");
    await waitFor(() =>
      expect(screen.queryByText("final chunk only")).not.toBeInTheDocument(),
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Copy last answer" }))
        .toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Copy last answer" }));

    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith("Full persisted answer"),
    );
    expect(writeText).not.toHaveBeenCalledWith("final chunk only");
    expect(screen.queryByText("final chunk only")).not.toBeInTheDocument();
  });

  it("does not restart reveal when closed runtime text matches a hydrated answer", async () => {
    const finalText =
      "LIVE_STREAM_ALPHA LIVE_STREAM_BETA LIVE_STREAM_GAMMA LIVE_STREAM_DELTA";
    useRuntimeStore.setState({
      runtimeState: {
        activeRunIds: [],
        runs: {
          "run-output": {
            runId: "run-output",
            status: "closed",
            hadVisibleTextStream: true,
            lastEventId: 1,
            seenEventKeys: [],
            terminalEventType: "run_completed",
            entries: [
              runtimeTextDeltaEntry({
                eventId: 1,
                id: "run-output:1:0",
                text: finalText,
              }),
            ],
          },
        },
      },
    });
    listSessionMessagesMock.mockResolvedValue([
      {
        content: finalText,
        message_id: "assistant-hydrated-final",
        role_id: "MainAgent",
        run_id: "run-output",
      },
    ]);

    const { container } = renderTimeline();

    await waitForSingleVisibleText(finalText);
    expect(container.querySelectorAll("article.at-message")).toHaveLength(1);
    expect(container.querySelector(".at-message-streaming-text")).toBeNull();
    expect(container.querySelector(".streaming-cursor")).toBeNull();
    expect(container.querySelector("[data-streaming='true']")).toBeNull();
  });

  it("keeps hydrated open runtime text in the streaming row instead of adding an empty cursor", async () => {
    useRuntimeStore.setState({
      runtimeState: {
        activeRunIds: ["run-1"],
        runs: {
          "run-1": {
            runId: "run-1",
            status: "open",
            hadVisibleTextStream: true,
            lastEventId: 3,
            seenEventKeys: [],
            terminalEventType: null,
            entries: [
              {
                id: "run-1:4:0",
                sessionId: "session-1",
                runId: "run-1",
                roleId: "MainAgent",
                kind: "text_delta",
                text: "already persisted",
                payload: { text: "already persisted" },
                eventId: 4,
                occurredAt: "2026-06-23T00:00:00Z",
              },
            ],
          },
        },
      },
    });
    listSessionMessagesMock.mockResolvedValue([
      {
        message_id: "assistant-1",
        role_id: "MainAgent",
        run_id: "run-1",
        content: "already persisted",
      },
    ]);

    const { container } = renderTimeline();

    await waitForSingleVisibleText("already persisted");
    const streamingText = container.querySelector<HTMLElement>(
      ".at-message-streaming-text",
    );
    expect(streamingText).not.toBeNull();
    expect(streamingText).toHaveAttribute("data-streaming", "true");
    expect(streamingText).toHaveTextContent("already persisted");
    expect(container.querySelectorAll(".at-message-streaming-text")).toHaveLength(1);
    expect(container.querySelectorAll(".streaming-cursor")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Copy last answer" }))
      .not.toBeInTheDocument();
  });

  it("keeps hydrated open runtime text streaming before replayed deltas arrive", async () => {
    useRuntimeStore.setState({
      runtimeState: {
        activeRunIds: ["run-1"],
        runs: {
          "run-1": {
            runId: "run-1",
            status: "open",
            lastEventId: 3,
            seenEventKeys: [],
            terminalEventType: null,
            entries: [
              {
                id: "run-1:1:0",
                sessionId: "session-1",
                runId: "run-1",
                roleId: "MainAgent",
                kind: "run_started",
                text: "",
                payload: {},
                eventId: 1,
                occurredAt: "2026-06-23T00:00:00Z",
              },
            ],
          },
        },
      },
    });
    listSessionMessagesMock.mockResolvedValue([
      {
        message_id: "assistant-1",
        role_id: "MainAgent",
        run_id: "run-1",
        content: "partial persisted answer",
      },
    ]);

    const { container } = renderTimeline();

    await waitForSingleVisibleText("partial persisted answer");
    const streamingText = container.querySelector<HTMLElement>(
      ".at-message-streaming-text",
    );
    expect(streamingText).not.toBeNull();
    expect(streamingText).toHaveTextContent("partial persisted answer");
    expect(container.querySelectorAll(".at-message-streaming-text")).toHaveLength(1);
    expect(container.querySelectorAll(".streaming-cursor")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Copy last answer" }))
      .not.toBeInTheDocument();
  });

  it("does not replay hydrated thinking from a closed runtime stream", async () => {
    const thinkingText =
      "The user wants me to explore the project to understand how the Skill system is implemented.";
    setRuntimeStateFromEvents([
      relayRunEvent({
        event_id: 1,
        event_type: "thinking_started",
        payload_json: JSON.stringify({ part_index: 0 }),
        run_id: "run-thinking",
        trace_id: "run-thinking",
      }),
      relayRunEvent({
        event_id: 2,
        event_type: "thinking_delta",
        payload_json: JSON.stringify({
          part_index: 0,
          text: thinkingText,
        }),
        run_id: "run-thinking",
        trace_id: "run-thinking",
      }),
      relayRunEvent({
        event_id: 3,
        event_type: "thinking_finished",
        payload_json: JSON.stringify({ part_index: 0 }),
        run_id: "run-thinking",
        trace_id: "run-thinking",
      }),
      relayRunEvent({
        event_id: 4,
        event_type: "run_completed",
        payload_json: JSON.stringify({ status: "completed" }),
        run_id: "run-thinking",
        trace_id: "run-thinking",
      }),
    ]);
    listSessionMessagesMock.mockResolvedValue([
      {
        message: {
          parts: [
            {
              content: thinkingText,
              part_kind: "thinking",
            },
          ],
        },
        message_id: "assistant-thinking",
        role_id: "MainAgent",
        run_id: "run-thinking",
      },
    ]);

    const { container } = renderTimeline("session-1", {
      runtimeRunId: "run-thinking",
    });

    await waitFor(() =>
      expect(container.querySelector("details.at-processed-group")).not.toBeNull(),
    );
    openProcessedGroup(container);
    expect(await screen.findByText("Thinking")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryAllByText(thinkingText)).toHaveLength(1));
    expect(container.querySelectorAll(".at-message-thinking")).toHaveLength(1);
  });

  it("keeps live tool and approval rows after hydrated text in an open stream", async () => {
    setRuntimeStateFromEvents([
      relayRunEvent({
        event_id: 1,
        event_type: "text_delta",
        instance_id: "main-instance",
        role_id: "MainAgent",
        run_id: "run-live-overlay",
        trace_id: "run-live-overlay",
        payload_json: JSON.stringify({ text: "already persisted" }),
      }),
      relayRunEvent({
        event_id: 2,
        event_type: "tool_call",
        instance_id: "main-instance",
        role_id: "MainAgent",
        run_id: "run-live-overlay",
        trace_id: "run-live-overlay",
        payload_json: JSON.stringify({
          args: { command: "date", status: "pending" },
          tool_call_id: "call-live-tool",
          action_family: "run",
          semantic_category: "execution",
          tool_name: "shell",
        }),
      }),
      relayRunEvent({
        event_id: 3,
        event_type: "tool_approval_requested",
        instance_id: "main-instance",
        role_id: "MainAgent",
        run_id: "run-live-overlay",
        trace_id: "run-live-overlay",
        payload_json: JSON.stringify({
          acp_options: [
            { name: "Approve", optionId: "approve_exact" },
            { name: "Deny", optionId: "deny" },
          ],
          args_preview: "npm test",
          tool_call_id: "approval-live-tool",
          action_family: "run",
          semantic_category: "execution",
          tool_name: "execute_command",
        }),
      }),
    ]);
    listSessionMessagesMock.mockResolvedValue([
      {
        content: "already persisted",
        message_id: "assistant-run-live-overlay",
        role_id: "MainAgent",
        run_id: "run-live-overlay",
      },
    ]);

    const { container } = renderTimeline("session-1", {
      runtimeRunId: "run-live-overlay",
    });

    await waitForSingleVisibleText("already persisted");
    expect(await screen.findByText("Running: shell")).toBeVisible();
    expect(await screen.findByText("Approval requested: execute_command")).toBeVisible();
    await waitForToolPreviews(container, [
      "date",
      "Args: npm test",
    ]);
    expect(container.querySelectorAll("article.at-message")).toHaveLength(3);
  });

  it("keeps live runtime tools when open round hydration already has the same call", async () => {
    setRuntimeStateFromEvents([
      relayRunEvent({
        event_id: 1,
        event_type: "tool_call",
        instance_id: "main-instance",
        role_id: "MainAgent",
        run_id: "run-live-tool-hydrated",
        trace_id: "run-live-tool-hydrated",
        payload_json: JSON.stringify({
          args: { command: "runtime live command" },
          tool_call_id: "call-live-tool-hydrated",
          action_family: "run",
          semantic_category: "execution",
          tool_name: "shell",
        }),
      }),
    ]);
    listSessionMessagesMock.mockResolvedValue([
      {
        message: {
          parts: [
            {
              args: { command: "persisted command" },
              part_kind: "tool-call",
              tool_call_id: "call-live-tool-hydrated",
              action_family: "run",
              semantic_category: "execution",
              tool_name: "shell",
            },
          ],
        },
        message_id: "assistant-live-tool-hydrated",
        role_id: "MainAgent",
        run_id: "run-live-tool-hydrated",
      },
    ]);
    listSessionRoundsMock.mockResolvedValue({
      has_more: false,
      items: [
        {
          created_at: "2026-06-23T12:42:33Z",
          run_id: "run-live-tool-hydrated",
          run_status: "running",
          run_user_message: "Hydrated open tool check",
        },
      ],
      next_cursor: null,
    });

    const { container } = renderTimeline("session-1", {
      runtimeRunId: "run-live-tool-hydrated",
    });

    await waitForToolPreviews(container, ["runtime live command"]);
    const visibleToolCards = Array.from(container.querySelectorAll(".at-message-tool"))
      .filter((element) =>
        element.closest("details.at-processed-group:not([open])") === null
      );
    expect(visibleToolCards.length).toBeGreaterThanOrEqual(1);
  });

  it("renders live subagent overlay as a separate row beside persisted history", async () => {
    setRuntimeStateFromEvents([
      relayRunEvent({
        event_id: 1,
        event_type: "thinking_started",
        payload_json: JSON.stringify({ part_index: 0 }),
        role_id: "Writer",
        run_id: "subagent_run_1",
        trace_id: "subagent_run_1",
      }),
      relayRunEvent({
        event_id: 2,
        event_type: "thinking_delta",
        payload_json: JSON.stringify({
          part_index: 0,
          text: "live thought",
        }),
        role_id: "Writer",
        run_id: "subagent_run_1",
        trace_id: "subagent_run_1",
      }),
    ]);
    listSessionMessagesMock.mockResolvedValue([
      {
        message: {
          parts: [{ part_kind: "text", content: "persisted" }],
        },
        message_id: "subagent-persisted",
        role_id: "Writer",
        run_id: "subagent_run_1",
      },
    ]);

    const { container } = renderTimeline("session-1", {
      runtimeRunId: "subagent_run_1",
    });

    expect(await screen.findByText("persisted")).toBeVisible();
    expect(screen.getByText("live thought")).toBeVisible();
    const rowTexts = Array.from(container.querySelectorAll("article.at-message"))
      .map((row) => row.textContent ?? "");
    expect(rowTexts).toHaveLength(2);
    expect(rowTexts[0]).toContain("persisted");
    expect(rowTexts[1]).toContain("Thinking");
    expect(rowTexts[1]).toContain("live thought");
    const thinkingBlock = container.querySelector(".at-message-thinking");
    expect(thinkingBlock).toHaveAttribute("data-streaming", "true");
    expect(thinkingBlock).toHaveAttribute("open");
  });

  it("shows a pending cursor for an open scoped run before output arrives", async () => {
    setRuntimeStateFromEvents([
      relayRunEvent({
        event_id: 1,
        event_type: "run_started",
        payload_json: "{}",
        run_id: "run-idle",
        trace_id: "run-idle",
      }),
    ]);
    listSessionMessagesMock.mockResolvedValue([]);

    const { container } = renderTimeline("session-1", {
      runtimeRunId: "run-idle",
    });

    await waitFor(() =>
      expect(container.querySelectorAll("article.at-message")).toHaveLength(1),
    );
    expect(container.querySelector(".at-message-streaming-text")).not.toBeNull();
    expect(container.querySelectorAll(".streaming-cursor")).toHaveLength(1);
    expect(screen.queryByText("Run started")).not.toBeInTheDocument();
    expect(screen.queryByText("run started")).not.toBeInTheDocument();
  });

  it("keeps repeated live text after a tool even when earlier text is hydrated", async () => {
    useRuntimeStore.setState({
      runtimeState: {
        activeRunIds: ["run-1"],
        runs: {
          "run-1": {
            runId: "run-1",
            status: "open",
            lastEventId: 4,
            seenEventKeys: [],
            terminalEventType: null,
            entries: [
              {
                id: "run-1:1:0",
                sessionId: "session-1",
                runId: "run-1",
                roleId: "MainAgent",
                kind: "text_delta",
                text: "repeat",
                payload: { text: "repeat" },
                eventId: 1,
                occurredAt: "2026-06-23T00:00:00Z",
              },
              {
                id: "run-1:2:1",
                sessionId: "session-1",
                runId: "run-1",
                roleId: "MainAgent",
                kind: "tool_call",
                text: "shell",
                payload: {
                  args: { command: "date" },
                  tool_call_id: "call-repeat",
                  action_family: "run",
                  semantic_category: "execution",
                  tool_name: "shell",
                },
                eventId: 2,
                occurredAt: "2026-06-23T00:00:01Z",
              },
              {
                id: "run-1:3:2",
                sessionId: "session-1",
                runId: "run-1",
                roleId: "MainAgent",
                kind: "text_delta",
                text: "repeat",
                payload: { text: "repeat" },
                eventId: 3,
                occurredAt: "2026-06-23T00:00:02Z",
              },
            ],
          },
        },
      },
    });
    listSessionMessagesMock.mockResolvedValue([
      {
        message_id: "assistant-1",
        role_id: "MainAgent",
        run_id: "run-1",
        content: "repeat",
      },
    ]);

    const { container } = renderTimeline();

    await waitFor(() => expect(screen.queryAllByText("repeat")).toHaveLength(2));
    expect(screen.queryAllByText("repeat")[0]).toBeVisible();
    expect(screen.getByText("Running: shell")).toBeVisible();
    expect(container.querySelectorAll(".at-message-streaming-text")).toHaveLength(1);
    expect(container.querySelectorAll(".streaming-cursor")).toHaveLength(1);
    expect(container.querySelectorAll("article.at-message")).toHaveLength(3);
  });

  it("starts reconnected text after idle and tool boundaries in fresh segments", async () => {
    useRuntimeStore.setState({
      runtimeState: {
        activeRunIds: ["run-rebind-text"],
        runs: {
          "run-rebind-text": {
            runId: "run-rebind-text",
            status: "open",
            lastEventId: 6,
            seenEventKeys: [],
            terminalEventType: null,
            entries: [
              {
                id: "run-rebind-text:1:0",
                sessionId: "session-1",
                runId: "run-rebind-text",
                roleId: "MainAgent",
                kind: "text_delta",
                text: "hello",
                payload: { text: "hello" },
                eventId: 1,
                occurredAt: "2026-06-23T00:00:00Z",
              },
              {
                id: "run-rebind-text:2:1",
                sessionId: "session-1",
                runId: "run-rebind-text",
                roleId: "MainAgent",
                kind: "thinking_started",
                text: "thinking started",
                payload: { part_index: 0 },
                eventId: 2,
                occurredAt: "2026-06-23T00:00:01Z",
              },
              {
                id: "run-rebind-text:3:2",
                sessionId: "session-1",
                runId: "run-rebind-text",
                roleId: "MainAgent",
                kind: "thinking_finished",
                text: "thinking finished",
                payload: { part_index: 0 },
                eventId: 3,
                occurredAt: "2026-06-23T00:00:02Z",
              },
              {
                id: "run-rebind-text:4:3",
                sessionId: "session-1",
                runId: "run-rebind-text",
                roleId: "MainAgent",
                kind: "text_delta",
                text: " world",
                payload: { text: " world" },
                eventId: 4,
                occurredAt: "2026-06-23T00:00:03Z",
              },
              {
                id: "run-rebind-text:5:4",
                sessionId: "session-1",
                runId: "run-rebind-text",
                roleId: "MainAgent",
                kind: "tool_call",
                text: "shell",
                payload: {
                  args: { command: "pwd" },
                  tool_call_id: "call-rebind-text",
                  action_family: "run",
                  semantic_category: "execution",
                  tool_name: "shell",
                },
                eventId: 5,
                occurredAt: "2026-06-23T00:00:04Z",
              },
              {
                id: "run-rebind-text:6:5",
                sessionId: "session-1",
                runId: "run-rebind-text",
                roleId: "MainAgent",
                kind: "text_delta",
                text: " after",
                payload: { text: " after" },
                eventId: 6,
                occurredAt: "2026-06-23T00:00:05Z",
              },
            ],
          },
        },
      },
    });
    listSessionMessagesMock.mockResolvedValue([
      {
        message_id: "assistant-1",
        role_id: "MainAgent",
        run_id: "run-rebind-text",
        content: "hello",
      },
    ]);

    const { container } = renderTimeline("session-1", {
      runtimeRunId: "run-rebind-text",
    });

    await waitForSingleVisibleText("hello");
    expect(await screen.findByText("world")).toBeVisible();
    expect(await screen.findByText("Running: shell")).toBeVisible();
    await waitForToolPreviews(container, ["pwd"]);
    const streamingText = container.querySelector<HTMLElement>(
      ".at-message-streaming-text",
    );
    expect(streamingText).not.toBeNull();
    expect(streamingText).toHaveTextContent("after");
    expect(streamingText).not.toHaveTextContent("hello");
    expect(streamingText).not.toHaveTextContent("world");
    expect(container.querySelectorAll(".streaming-cursor")).toHaveLength(1);
    expect(container.querySelectorAll("article.at-message")).toHaveLength(4);
  });

  it("keeps post-checkpoint runtime deltas when hydration only covers earlier output", async () => {
    useRuntimeStore.setState({
      runtimeState: {
        activeRunIds: [],
        runs: {
          "run-refresh": {
            runId: "run-refresh",
            status: "closed",
            lastEventId: 4,
            replayAfterEventId: 2,
            seenEventKeys: [],
            terminalEventType: "run_completed",
            entries: [
              {
                id: "run-refresh:3:0",
                sessionId: "session-1",
                runId: "run-refresh",
                roleId: "MainAgent",
                kind: "text_delta",
                text: "Post-refresh continuation",
                payload: { text: "Post-refresh continuation" },
                eventId: 3,
                occurredAt: "2026-06-23T00:00:00Z",
              },
              {
                id: "run-refresh:4:1",
                sessionId: "session-1",
                runId: "run-refresh",
                roleId: "MainAgent",
                kind: "run_completed",
                text: "completed",
                payload: { status: "completed" },
                eventId: 4,
                occurredAt: "2026-06-23T00:00:01Z",
              },
            ],
          },
        },
      },
    });
    listSessionMessagesMock.mockResolvedValue([
      {
        message_id: "assistant-refresh",
        role_id: "MainAgent",
        run_id: "run-refresh",
        content: "Checkpoint chunk",
      },
    ]);

    renderTimeline();

    expect(await screen.findByText("Checkpoint chunk")).toBeVisible();
    expect(await screen.findByText("Post-refresh continuation")).toBeVisible();
    expect(screen.queryByText("completed")).not.toBeInTheDocument();
  });

  it("keeps closed runtime tool events when a hydrated answer covers the same run", async () => {
    useRuntimeStore.setState({
      runtimeState: {
        activeRunIds: [],
        runs: {
          "run-1": {
            runId: "run-1",
            status: "closed",
            lastEventId: 5,
            seenEventKeys: [],
            terminalEventType: "run_completed",
            entries: [
              {
                id: "run-1:1:0",
                sessionId: "session-1",
                runId: "run-1",
                roleId: "MainAgent",
                kind: "text_delta",
                text: "duplicated runtime chunk",
                payload: { text: "duplicated runtime chunk" },
                eventId: 1,
                occurredAt: "2026-06-23T00:00:00Z",
              },
              {
                id: "run-1:2:1",
                sessionId: "session-1",
                runId: "run-1",
                roleId: "MainAgent",
                kind: "tool_call",
                text: "execute_command",
                payload: {
                  args: { cmd: "npm test" },
                  tool_call_id: "tool-1",
                  action_family: "run",
                  semantic_category: "execution",
                  tool_name: "execute_command",
                },
                eventId: 2,
                occurredAt: "2026-06-23T00:00:01Z",
              },
              {
                id: "run-1:3:2",
                sessionId: "session-1",
                runId: "run-1",
                roleId: "MainAgent",
                kind: "tool_result",
                text: "execute_command",
                payload: {
                  result: {
                    ok: false,
                    error: {
                      message: "File not found: .",
                      retryable: false,
                      type: "validation_error",
                    },
                  },
                  tool_call_id: "tool-1",
                  action_family: "run",
                  semantic_category: "execution",
                  tool_name: "execute_command",
                },
                eventId: 3,
                occurredAt: "2026-06-23T00:00:02Z",
              },
              {
                id: "run-1:4:3",
                sessionId: "session-1",
                runId: "run-1",
                roleId: "MainAgent",
                kind: "run_completed",
                text: "completed",
                payload: { phase: "completed" },
                eventId: 4,
                occurredAt: "2026-06-23T00:00:03Z",
              },
            ],
          },
        },
      },
    });
    listSessionMessagesMock.mockResolvedValue([
      {
        message_id: "assistant-1",
        role_id: "MainAgent",
        trace_id: "run-1",
        content: "Full persisted answer",
      },
    ]);

    const { container } = renderTimeline();

    expect(await screen.findByText("Full persisted answer")).toBeVisible();
    expect(screen.queryByText("duplicated runtime chunk")).not.toBeInTheDocument();
    expect(screen.queryByText("completed")).not.toBeInTheDocument();
    expect(screen.queryByText("Running: execute_command")).not.toBeInTheDocument();
    expect(await screen.findByText("Processed")).toBeVisible();
    const toolTitle = await screen.findByText("Run failed: execute_command");
    expect(toolTitle).not.toBeVisible();
    openProcessedGroup(container);
    expect(toolTitle).toBeVisible();
    expect(toolPreviewTexts(container)).toEqual(["File not found: ."]);
    const toolBlock = screenElement(toolTitle).closest(".at-message-tool");
    expect(toolBlock).toHaveAttribute("data-status", "error");
    expect(toolPreElement(screenElement(toolTitle))).toHaveTextContent(/npm test/);
  });

  it("closes unresolved runtime tool calls when a stream reaches a terminal run state", async () => {
    useRuntimeStore.setState({
      runtimeState: {
        activeRunIds: [],
        runs: {
          "run-terminal-tool": {
            runId: "run-terminal-tool",
            status: "closed",
            lastEventId: 2,
            seenEventKeys: [],
            terminalEventType: "run_completed",
            entries: [
              {
                id: "run-terminal-tool:1:0",
                sessionId: "session-1",
                runId: "run-terminal-tool",
                roleId: "MainAgent",
                kind: "tool_call",
                text: "shell",
                payload: {
                  args: { command: "echo tool-pressure-1" },
                  tool_call_id: "call-terminal-tool",
                  action_family: "run",
                  semantic_category: "execution",
                  tool_name: "shell",
                },
                eventId: 1,
                occurredAt: "2026-06-23T00:00:01Z",
              },
              {
                id: "run-terminal-tool:2:1",
                sessionId: "session-1",
                runId: "run-terminal-tool",
                roleId: "MainAgent",
                kind: "run_completed",
                text: "completed",
                payload: { phase: "completed" },
                eventId: 2,
                occurredAt: "2026-06-23T00:00:02Z",
              },
            ],
          },
        },
      },
    });
    listSessionMessagesMock.mockResolvedValue([
      {
        message_id: "assistant-terminal-tool",
        role_id: "MainAgent",
        trace_id: "run-terminal-tool",
        content: "Final answer after tool call",
      },
    ]);

    const { container } = renderTimeline();

    expect(await screen.findByText("Final answer after tool call")).toBeVisible();
    expect(await screen.findByText("Processed")).toBeVisible();
    openProcessedGroup(container);
    expect(screen.queryByText("Running: shell")).not.toBeInTheDocument();
    const toolTitle = await screen.findByText("Ran: shell");
    expect(toolTitle).toBeVisible();
    const toolBlock = screenElement(toolTitle).closest(".at-message-tool");
    expect(toolBlock).toHaveAttribute("data-status", "completed");
    expect(toolBlock?.querySelector(".at-message-tool-spinner")).toBeNull();
    expect(toolPreElement(screenElement(toolTitle))).toHaveTextContent(
      /tool-pressure-1/,
    );
  });

  it("closes unresolved persisted tool calls inside terminal processed rounds", async () => {
    listSessionMessagesMock.mockResolvedValue([
      {
        message: {
          parts: [
            {
              args: { command: "echo persisted-pressure-1" },
              part_kind: "tool-call",
              tool_call_id: "call-persisted-terminal-tool",
              action_family: "run",
              semantic_category: "execution",
              tool_name: "shell",
            },
          ],
        },
        message_id: "assistant-persisted-terminal-tool",
        role_id: "MainAgent",
        run_id: "run-persisted-terminal-tool",
      },
      {
        content: "Final persisted answer",
        message_id: "assistant-persisted-terminal-answer",
        role_id: "MainAgent",
        run_id: "run-persisted-terminal-tool",
      },
    ]);
    listSessionRoundsMock.mockResolvedValue({
      has_more: false,
      items: [
        {
          created_at: "2026-06-23T12:42:33Z",
          run_id: "run-persisted-terminal-tool",
          run_status: "completed",
          run_user_message: "Run a persisted terminal tool",
        },
      ],
      next_cursor: null,
    });

    const { container } = renderTimeline();

    expect(await screen.findByText("Final persisted answer")).toBeVisible();
    expect(await screen.findByText("Processed")).toBeVisible();
    openProcessedGroup(container);
    expect(screen.queryByText("Running: shell")).not.toBeInTheDocument();
    const toolTitle = await screen.findByText("Ran: shell");
    expect(toolTitle).toBeVisible();
    const toolBlock = screenElement(toolTitle).closest(".at-message-tool");
    expect(toolBlock).toHaveAttribute("data-status", "completed");
    expect(toolBlock?.querySelector(".at-message-tool-spinner")).toBeNull();
    const persistedTool = within(toolBlock as HTMLElement);
    expect(persistedTool.getByText("Input").nextElementSibling).toHaveTextContent(
      /persisted-pressure-1/,
    );
    expect(persistedTool.queryByText("Output")).not.toBeInTheDocument();
  });

  it("renders image media references with previewable images", async () => {
    listSessionMessagesMock.mockResolvedValue([
      {
        message_id: "assistant-image",
        message: {
          parts: [
            { kind: "text", text: "Here is the chart." },
            {
              asset_id: "asset-1",
              kind: "media_ref",
              mime_type: "image/png",
              modality: "image",
              name: "chart.png",
              url: "https://example.test/chart.png",
            },
          ],
        },
        role_id: "MainAgent",
      },
    ]);

    renderTimeline();

    expect(await screen.findByText("Here is the chart.")).toBeVisible();
    const image = await screen.findByRole("img", { name: "chart.png" });
    expect(image).toHaveAttribute("src", "https://example.test/chart.png");
    expect(screen.getByText("chart.png")).toBeVisible();
  });

  it("renders workspace image previews mentioned in persisted text", async () => {
    listSessionMessagesMock.mockResolvedValue([
      {
        content: "已生成 `ai_briefing.png`（17.7KB）。",
        message_id: "assistant-workspace-image",
        role_id: "MainAgent",
      },
    ]);

    renderTimeline("session-1", { workspaceId: "workspace-1" });

    expect(await screen.findAllByText(/ai_briefing\.png/)).toHaveLength(2);
    const image = await screen.findByRole("img", { name: "ai_briefing.png" });
    expect(image).toHaveAttribute(
      "src",
      "/api/workspaces/workspace-1/preview-file?path=ai_briefing.png",
    );
  });

  it("does not render workspace image previews without workspace context", async () => {
    listSessionMessagesMock.mockResolvedValue([
      {
        content: "已生成 `ai_briefing.png`（17.7KB）。",
        message_id: "assistant-workspace-image",
        role_id: "MainAgent",
      },
    ]);

    renderTimeline();

    expect(await screen.findAllByText(/ai_briefing\.png/)).toHaveLength(1);
    expect(screen.queryByRole("img", { name: "ai_briefing.png" }))
      .not.toBeInTheDocument();
  });

  it("renders media_ref previews from persisted tool returns", async () => {
    listSessionMessagesMock.mockResolvedValue([
      {
        message_id: "assistant-tool-image",
        message: {
          parts: [
            {
              content: {
                data: {
                  content: [
                    {
                      kind: "media_ref",
                      mime_type: "image/png",
                      modality: "image",
                      name: "example.png",
                      url: "/api/sessions/session-1/media/asset-1/file",
                    },
                  ],
                  path: "docs/example.png",
                  type: "image",
                },
                error: null,
                ok: true,
              },
              part_kind: "tool-return",
              tool_call_id: "call-read-image",
              action_family: "read",
              semantic_category: "file-read",
              tool_name: "read",
            },
          ],
        },
        role_id: "MainAgent",
      },
    ]);

    const { container } = renderTimeline();

    const resultTitle = await screen.findByText("Read: read");
    expect(resultTitle).toBeVisible();
    fireEvent.click(resultTitle);
    const image = await screen.findByRole("img", { name: "example.png" });
    expect(image).toHaveAttribute(
      "src",
      "/api/sessions/session-1/media/asset-1/file",
    );
    expect(image.closest(".at-message-tool")).not.toBeNull();
    expect(container.querySelectorAll(".at-message-tool .at-message-media"))
      .toHaveLength(1);
  });

  it("renders non-image media references as resource links", async () => {
    listSessionMessagesMock.mockResolvedValue([
      {
        message_id: "assistant-audio",
        message: {
          parts: [
            {
              media_type: "audio/mpeg",
              name: "voice.mp3",
              part_kind: "media_ref",
              url: "https://example.test/voice.mp3",
            },
          ],
        },
        role_id: "MainAgent",
      },
    ]);

    renderTimeline();

    const link = await screen.findByRole("link", { name: "voice.mp3" });
    expect(link).toHaveAttribute("href", "https://example.test/voice.mp3");
  });

  it("copies nested message content from persisted message rows", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    listSessionMessagesMock.mockResolvedValue([
      {
        message: { content: "Nested persisted answer" },
        message_id: "assistant-nested",
        role_id: "MainAgent",
      },
    ]);

    renderTimeline();

    const copyButton = await screen.findByRole("button", {
      name: "Copy last answer",
    });
    await waitFor(() => expect(copyButton).toBeEnabled());
    fireEvent.click(copyButton);

    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith("Nested persisted answer"),
    );
  });

  it("renders user prompt parts without injected skill candidate text", async () => {
    listSessionMessagesMock.mockResolvedValue([
      {
        message: {
          parts: [
            {
              content: [
                "Actual user prompt",
                "",
                "## Skill Candidates",
                "- hidden: internal routing text",
              ].join("\n"),
              part_kind: "user-prompt",
            },
          ],
        },
        message_id: "user-prompt",
        role: "user",
        role_id: "writer",
      },
    ]);

    const { container } = renderTimeline();

    expect(await screen.findByText("Actual user prompt")).toBeVisible();
    expect(screen.queryByText("## Skill Candidates")).not.toBeInTheDocument();
    expect(screen.queryByText(/hidden: internal routing text/)).not.toBeInTheDocument();
    expect(screen.queryByText("message")).not.toBeInTheDocument();
    expect(screen.queryByText("writer")).not.toBeInTheDocument();
    expect(container.querySelector(".at-message-role")).toBeNull();
  });

  it("compacts provider API error bodies in assistant messages", async () => {
    listSessionMessagesMock.mockResolvedValue([
      {
        content: [
          "The request could not be completed because of an API or execution error.",
          "Details: status_code: 400, model_name: deepseek-v4-flash, body: {'message': 'The reasoning_content in the thinking mode must be passed back to the API.', 'type': 'invalid_request_error'}",
          "Root cause: Error code: 400 - {'error': {'message': 'The reasoning_content in the thinking mode must be passed back to the API.'}}",
        ].join(" "),
        message_id: "assistant-api-error",
        role_id: "MainAgent",
      },
    ]);

    renderTimeline();

    expect(await screen.findByText(/API request failed \(400\) - deepseek-v4-flash/)).toBeVisible();
    expect(screen.getByText(/reasoning_content in the thinking mode/)).toBeVisible();
    expect(screen.queryByText(/Root cause/)).not.toBeInTheDocument();
    expect(screen.queryByText(/invalid_request_error/)).not.toBeInTheDocument();
  });

  it("renders tool calls, results, and validation failures from message parts", async () => {
    listSessionMessagesMock.mockResolvedValue([
      {
        message: {
          parts: [
            {
              args: { cmd: "npm test" },
              kind: "tool-call",
              tool_call_id: "tool-1",
              action_family: "run",
              semantic_category: "execution",
              tool_name: "execute_command",
            },
            {
              content: "tests passed",
              kind: "tool-return",
              tool_call_id: "tool-1",
              action_family: "run",
              semantic_category: "execution",
              tool_name: "execute_command",
            },
            {
              content: "path is required",
              part_kind: "retry-prompt",
              tool_call_id: "tool-2",
              action_family: "read",
              semantic_category: "file-read",
              tool_name: "read_file",
            },
            {
              args: { pattern: "**/*.ts" },
              kind: "tool-call",
              tool_call_id: "tool-3",
              action_family: "search",
              semantic_category: "file-read",
              tool_name: "glob",
            },
          ],
        },
        message_id: "assistant-tools",
        role_id: "MainAgent",
      },
    ]);

    const { container } = renderTimeline();

    expect(screen.queryByText("Running: execute_command")).not.toBeInTheDocument();
    const resultTitle = await screen.findByText("Ran: execute_command");
    expect(resultTitle).toBeVisible();
    expect(screen.getByText("Tool validation: read_file")).toBeVisible();
    expect(screen.getByText("Searching: glob")).toBeVisible();
    expect(resultTitle).toHaveAttribute("title", "Ran: execute_command");
    expect(container.querySelector('.at-message-tool-preview[title="tests passed"]'))
      .toHaveTextContent("tests passed");
    expect(container.querySelectorAll(".at-message-tool")).toHaveLength(3);
    expect(toolPreviewTexts(container)).toEqual([
      "tests passed",
      "path is required",
      "**/*.ts",
    ]);
    expect(screen.getByText("cmd: npm test").closest("details:not([open])"))
      .not.toBeNull();

    fireEvent.click(resultTitle);

    expect(screen.getByText("cmd: npm test")).toBeVisible();
  });

  it("drops duplicate persisted thinking rows left after tool replay merge", async () => {
    listSessionMessagesMock.mockResolvedValue([
      {
        message: {
          parts: [
            {
              content: "Check the workspace state.",
              part_kind: "thinking",
            },
            {
              args: { command: "pwd" },
              part_kind: "tool-call",
              tool_call_id: "call-replayed",
              action_family: "run",
              semantic_category: "execution",
              tool_name: "shell",
            },
          ],
        },
        message_id: "assistant-call",
        role_id: "MainAgent",
        run_id: "run-replayed",
      },
      {
        message: {
          parts: [
            {
              content: "done",
              part_kind: "tool-return",
              tool_call_id: "call-replayed",
              action_family: "run",
              semantic_category: "execution",
              tool_name: "shell",
            },
          ],
        },
        message_id: "assistant-result",
        role_id: "MainAgent",
        run_id: "run-replayed",
      },
      {
        message: {
          parts: [
            {
              content: "Check the workspace state.",
              part_kind: "thinking",
            },
            {
              args: { command: "pwd" },
              part_kind: "tool-call",
              tool_call_id: "call-replayed",
              action_family: "run",
              semantic_category: "execution",
              tool_name: "shell",
            },
          ],
        },
        message_id: "assistant-call-replayed",
        role_id: "MainAgent",
        run_id: "run-replayed",
      },
    ]);

    const { container } = renderTimeline();

    const resultTitle = await screen.findByText("Ran: shell");
    expect(resultTitle).toBeVisible();
    expect(screen.queryByText("Running: shell")).not.toBeInTheDocument();
    expect(screen.getAllByText("Thinking")).toHaveLength(1);
    expect(toolPreviewTexts(container)).toEqual(["done"]);
    expect(toolPreElement(screenElement(resultTitle))).toHaveTextContent(/pwd/);
    expect(container.querySelectorAll("article.at-message")).toHaveLength(1);
  });

  it("normalizes string tool args for persisted and runtime tool calls", async () => {
    setRuntimeStateFromEvents([
      relayRunEvent({
        event_id: 1,
        event_type: "tool_call",
        payload_json: JSON.stringify({
          args: "{\"query\":\"Anthropic funding 2026\"}",
          tool_call_id: "call-live",
          action_family: "search",
          semantic_category: "web",
          tool_name: "websearch",
        }),
      }),
      relayRunEvent({
        event_id: 2,
        event_type: "tool_call",
        payload_json: JSON.stringify({
          args: "[\"one\",\"two\"]",
          tool_call_id: "call-array",
          tool_name: "batch",
        }),
      }),
      relayRunEvent({
        event_id: 3,
        event_type: "tool_call",
        payload_json: JSON.stringify({
          args: "not json",
          tool_call_id: "call-raw",
          tool_name: "raw",
        }),
      }),
    ]);
    listSessionMessagesMock.mockResolvedValue([
      {
        message: {
          parts: [
            {
              args: "{\"query\":\"Anthropic safety policy\"}",
              kind: "tool-call",
              tool_call_id: "call-history",
              action_family: "search",
              semantic_category: "web",
              tool_name: "websearch",
            },
          ],
        },
        message_id: "assistant-string-tool-args",
        role_id: "MainAgent",
      },
    ]);

    const { container } = renderTimeline();

    await waitFor(() =>
      expect(screen.getAllByText("Searching: websearch")).toHaveLength(2),
    );
    expect(screen.getByText("Processing: batch")).toBeVisible();
    expect(screen.getByText("Processing: raw")).toBeVisible();
    await waitForToolPreviews(container, [
      "Anthropic safety policy",
      "Anthropic funding 2026",
      "one, two",
      "not json",
    ]);
    const details = toolPreElements(container).map(
      (element) => element.textContent ?? "",
    );
    expect(details).toContain("query: Anthropic safety policy");
    expect(details).toContain("query: Anthropic funding 2026");
    expect(details.some((detail) =>
      detail.includes("\"__items\"") &&
        detail.includes("\"one\"") &&
        detail.includes("\"two\""),
    )).toBe(true);
    expect(details.some((detail) => detail.includes("not json"))).toBe(true);
  });

  it("summarizes effective tool inputs for command, file, search, and URL fields", async () => {
    setRuntimeStateFromEvents([
      relayRunEvent({
        event_id: 1,
        event_type: "tool_call",
        payload_json: JSON.stringify({
          args: { command: "npm run lint", exit_code: 0, status: "running" },
          tool_call_id: "call-command",
          action_family: "run",
          semantic_category: "execution",
          tool_name: "shell",
        }),
      }),
      relayRunEvent({
        event_id: 2,
        event_type: "tool_call",
        payload_json: JSON.stringify({
          args: { filepath: "src/runtime/events.ts", status: "completed" },
          tool_call_id: "call-filepath",
          action_family: "read",
          semantic_category: "file-read",
          tool_name: "read",
        }),
      }),
      relayRunEvent({
        event_id: 3,
        event_type: "tool_call",
        payload_json: JSON.stringify({
          args: { q: "stream replay recovery", total_results: 5 },
          tool_call_id: "call-query",
          action_family: "search",
          semantic_category: "file-read",
          tool_name: "search",
        }),
      }),
      relayRunEvent({
        event_id: 4,
        event_type: "tool_call",
        payload_json: JSON.stringify({
          args: { uri: "https://example.test/docs", status: "queued" },
          tool_call_id: "call-url",
          action_family: "search",
          semantic_category: "web",
          tool_name: "fetch",
        }),
      }),
    ]);
    listSessionMessagesMock.mockResolvedValue([]);

    const { container } = renderTimeline();

    await waitFor(() =>
      expect(container.querySelectorAll(".at-message-tool")).toHaveLength(4),
    );
    expect(toolPreviewTexts(container)).toEqual([
      "npm run lint",
      "src/runtime/events.ts",
      "stream replay recovery",
      "https://example.test/docs",
    ]);
    expect(screen.queryByText("running")).not.toBeInTheDocument();
    expect(screen.queryByText("completed")).not.toBeInTheDocument();
    expect(screen.queryByText("queued")).not.toBeInTheDocument();
  });

  it("scopes and deduplicates runtime stream rows by run", async () => {
    setRuntimeStateFromEvents([
      relayRunEvent({
        event_id: 1,
        event_type: "text_delta",
        instance_id: "inst-orch",
        role_id: "writer",
        run_id: "run-parent",
        trace_id: "run-parent",
        payload_json: JSON.stringify({ text: "parent hello" }),
      }),
      relayRunEvent({
        event_id: 1,
        event_type: "text_delta",
        instance_id: "inst-orch",
        role_id: "writer",
        run_id: "run-parent",
        trace_id: "run-parent",
        payload_json: JSON.stringify({ text: "parent hello" }),
      }),
      relayRunEvent({
        event_id: 2,
        event_type: "tool_call",
        instance_id: "inst-child",
        role_id: "runner",
        run_id: "subagent_run_1",
        trace_id: "subagent_run_1",
        payload_json: JSON.stringify({
          args: { command: "echo ok" },
          tool_call_id: "call-1",
          action_family: "run",
          semantic_category: "execution",
          tool_name: "shell",
        }),
      }),
    ]);
    listSessionMessagesMock.mockResolvedValue([]);

    const parentTimeline = renderTimeline("session-1", {
      runtimeRunId: "run-parent",
    });

    expect(await screen.findByText("parent hello")).toBeVisible();
    expect(screen.queryByText("Running: shell")).not.toBeInTheDocument();
    expect(
      parentTimeline.container.querySelectorAll("article.at-message"),
    ).toHaveLength(1);

    parentTimeline.unmount();

    const childTimeline = renderTimeline("session-1", {
      runtimeRunId: "subagent_run_1",
    });

    expect(await screen.findByText("Running: shell")).toBeVisible();
    expect(screen.queryByText("parent hello")).not.toBeInTheDocument();
    expect(toolPreviewTexts(childTimeline.container)).toEqual(["echo ok"]);
    expect(
      childTimeline.container.querySelectorAll("article.at-message"),
    ).toHaveLength(1);
  });

  it("renders visible subagent runtime tool calls on the selected subagent stream", async () => {
    setRuntimeStateFromEvents([
      relayRunEvent({
        event_id: 77,
        event_type: "tool_call",
        instance_id: "inst-subagent",
        role_id: "Writer",
        run_id: "subagent_run_live",
        trace_id: "subagent_run_live",
        payload_json: JSON.stringify({
          args: { command: "date" },
          tool_call_id: "call-visible-subagent",
          action_family: "run",
          semantic_category: "execution",
          tool_name: "shell",
        }),
      }),
    ]);
    listSessionMessagesMock.mockResolvedValue([]);

    const mainTimeline = renderTimeline("session-1", {
      runtimeRunId: "run-parent",
    });

    expect(await screen.findByText("No messages yet")).toBeVisible();
    expect(screen.queryByText("Running: shell")).not.toBeInTheDocument();

    mainTimeline.unmount();

    const subagentTimeline = renderTimeline("session-1", {
      runtimeRunId: "subagent_run_live",
    });

    const toolTitle = await screen.findByText("Running: shell");
    expect(toolTitle).toBeVisible();
    expect(toolPreviewTexts(subagentTimeline.container)).toEqual(["date"]);
    expect(
      subagentTimeline.container.querySelectorAll("article.at-message"),
    ).toHaveLength(1);

    const toolRow = messageArticle(toolTitle);
    expect(toolRow).toHaveAttribute("data-run-id", "subagent_run_live");
    expect(toolRow).toHaveAttribute("data-role-id", "Writer");
    expect(toolRow).toHaveAttribute("data-instance-id", "inst-subagent");
  });

  it("keeps live subagent stream rows out of the main session timeline", async () => {
    setRuntimeStateFromEvents([
      relayRunEvent({
        event_id: 1,
        event_type: "tool_call",
        instance_id: "main-instance",
        role_id: "MainAgent",
        run_id: "parent_run_1",
        trace_id: "parent_run_1",
        payload_json: JSON.stringify({
          args: {
            description: "Explore skill implementation",
            prompt: "Read the project and report back.",
            role_id: "Explorer",
          },
          tool_call_id: "call-spawn-explorer",
          action_family: "subagent",
          semantic_category: "orchestration",
          tool_name: "spawn_subagent",
        }),
      }),
      relayRunEvent({
        event_id: 1,
        event_type: "subagent_session_status_changed",
        instance_id: "subagent-instance-1",
        role_id: "Explorer",
        run_id: "subagent_run_1",
        trace_id: "subagent_run_1",
        payload_json: JSON.stringify({
          parent_run_id: "parent_run_1",
          parent_session_id: "session-1",
          status: "running",
          subagent_instance_id: "subagent-instance-1",
          subagent_role_id: "Explorer",
          subagent_run_id: "subagent_run_1",
        }),
      }),
      relayRunEvent({
        event_id: 2,
        event_type: "thinking_started",
        instance_id: "subagent-instance-1",
        role_id: "Explorer",
        run_id: "subagent_run_1",
        trace_id: "subagent_run_1",
        payload_json: JSON.stringify({ part_index: 0 }),
      }),
      relayRunEvent({
        event_id: 3,
        event_type: "thinking_delta",
        instance_id: "subagent-instance-1",
        role_id: "Explorer",
        run_id: "subagent_run_1",
        trace_id: "subagent_run_1",
        payload_json: JSON.stringify({
          part_index: 0,
          text: "child thought should stay in panel",
        }),
      }),
      relayRunEvent({
        event_id: 4,
        event_type: "text_delta",
        instance_id: "subagent-instance-1",
        role_id: "Explorer",
        run_id: "subagent_run_1",
        trace_id: "subagent_run_1",
        payload_json: JSON.stringify({
          text: "Now let me read all the core source files concurrently.",
        }),
      }),
      relayRunEvent({
        event_id: 5,
        event_type: "tool_call",
        instance_id: "subagent-instance-1",
        role_id: "Explorer",
        run_id: "subagent_run_1",
        trace_id: "subagent_run_1",
        payload_json: JSON.stringify({
          args: { path: "src/relay_teams/skills/__init__.py" },
          tool_call_id: "call-subagent-read",
          action_family: "read",
          semantic_category: "file-read",
          tool_name: "read",
        }),
      }),
      relayRunEvent({
        event_id: 6,
        event_type: "text_delta",
        instance_id: "subagent-instance-1",
        role_id: "Explorer",
        run_id: "parent_run_1",
        trace_id: "parent_run_1",
        payload_json: JSON.stringify({
          subagent_instance_id: "subagent-instance-1",
          subagent_role_id: "Explorer",
          subagent_run_id: "subagent_run_1",
          text: "child output with parent run id should stay out",
        }),
      }),
    ]);
    listSessionMessagesMock.mockResolvedValue([]);

    const { container } = renderTimeline("session-1", {
      primaryRoleId: "MainAgent",
    });

    expect(await screen.findByText("Starting subagent")).toBeVisible();
    expect(
      screen.queryByText("child thought should stay in panel"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Now let me read all the core source files concurrently."),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("child output with parent run id should stay out"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Reading: read")).not.toBeInTheDocument();
    expect(container.querySelector('[data-role-id="Explorer"]')).toBeNull();
  });

  it("shows tool duration and unwraps execution output envelopes", async () => {
    setRuntimeEntries([
      runtimeGenericEntry({
        eventId: 1,
        id: "run-duration:1:0",
        kind: "tool_result",
        payload: {
          result: {
            data: { exit_code: 0, stdout: "duration output" },
            meta: { duration_ms: 1250, tool_result_event_published: true },
            ok: true,
          },
          tool_call_id: "duration-call",
          action_family: "run",
          semantic_category: "execution",
          tool_name: "shell",
        },
        text: "shell",
      }),
    ]);
    listSessionMessagesMock.mockResolvedValue([]);

    const { container } = renderTimeline();

    await screen.findByText("Ran: shell");
    openProcessedGroup(container);
    const title = screen.getByText("Ran: shell");
    expect(screen.getByText("1.3 s")).toBeVisible();
    fireEvent.click(title);
    expect(screen.getByText(/exit code: 0/)).toBeVisible();
    expect(screen.getByText(/stdout: duration output/)).toBeVisible();
    expect(screen.queryByText(/tool_result_event_published/)).not.toBeInTheDocument();
  });

  it("resets round prompt disclosure state whenever the selected session changes", async () => {
    const prompts: Record<string, string> = {
      "session-1": "Session one prompt is long enough to use the compact disclosure control.",
      "session-2": "Session two prompt is also long enough to use its own disclosure state.",
    };
    listSessionMessagesMock.mockImplementation(async (sessionId) => [{
      content: `Answer for ${sessionId}`,
      message_id: `answer-${sessionId}`,
      role_id: "MainAgent",
      trace_id: `run-${sessionId}`,
    }]);
    listSessionRoundsMock.mockImplementation(async (sessionId) => ({
      has_more: false,
      items: [{
        run_id: `run-${sessionId}`,
        run_status: "completed",
        run_user_message: prompts[sessionId] ?? "Fallback prompt",
      }],
      next_cursor: null,
    }));

    function SessionSwitchHarness() {
      const [sessionId, setSessionId] = useState("session-1");
      const [queryClient] = useState(() => new QueryClient({
        defaultOptions: {
          queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
        },
      }));
      return (
        <QueryClientProvider client={queryClient}>
          <ConfigProvider>
            <AntApp>
              <button onClick={() => setSessionId("session-1")} type="button">Session 1</button>
              <button onClick={() => setSessionId("session-2")} type="button">Session 2</button>
              <MessageTimeline sessionId={sessionId} />
            </AntApp>
          </ConfigProvider>
        </QueryClientProvider>
      );
    }

    render(<SessionSwitchHarness />);
    const expandSessionOne = await screen.findByRole("button", { name: "Expand" });
    fireEvent.click(expandSessionOne);
    expect(screen.getByRole("button", { name: "Collapse" })).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Session 2" }));
    await screen.findByText("Answer for session-2");
    expect(screen.getByRole("button", { name: "Expand" })).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Session 1" }));
    await screen.findByText("Answer for session-1");
    expect(screen.getByRole("button", { name: "Expand" })).toBeVisible();
  });

  it("keeps the round prompt toggle anchored while remeasuring the virtual row", async () => {
    const restoreMeasurements = mockElementMeasurements({
      clientHeight: 220,
      rowHeight: 120,
    });
    try {
      listSessionMessagesMock.mockResolvedValue([
        {
          content: "Earlier answer",
          message_id: "answer-old",
          role_id: "MainAgent",
          trace_id: "run-old",
        },
        {
          content: "Prompt answer",
          message_id: "answer-prompt",
          role_id: "MainAgent",
          trace_id: "run-prompt-anchor",
        },
      ]);
      listSessionRoundsMock.mockResolvedValue({
        has_more: false,
        items: [{
          run_id: "run-prompt-anchor",
          run_status: "completed",
          run_user_message: "A long prompt whose disclosure should not move its control in the viewport.",
        }],
        next_cursor: null,
      });

      const { container } = renderTimeline();
      await screen.findByText("Prompt answer");
      const timeline = timelineElement(container);
      const toggle = await screen.findByRole("button", { name: "Expand" });
      const markerRow = toggle.closest<HTMLElement>(".at-timeline-row[data-row-key]");
      expect(markerRow).not.toBeNull();
      timeline.scrollTop = 80;
      fireEvent.scroll(timeline);
      const offsetBefore = translateY(markerRow) - timeline.scrollTop;

      fireEvent.pointerDown(toggle);
      fireEvent.click(toggle);

      await waitFor(() => expect(toggle).toHaveAttribute("aria-expanded", "true"));
      await waitFor(() =>
        expect(translateY(markerRow) - timeline.scrollTop).toBe(offsetBefore),
      );
    } finally {
      restoreMeasurements();
    }
  });

  it("keeps subagent-marked parent-run stream rows out while primary role metadata is loading", async () => {
    setRuntimeStateFromEvents([
      relayRunEvent({
        event_id: 1,
        event_type: "run_started",
        role_id: "MainAgent",
        run_id: "parent_run_1",
        trace_id: "parent_run_1",
        payload_json: JSON.stringify({ phase: "streaming" }),
      }),
      relayRunEvent({
        event_id: 2,
        event_type: "tool_call",
        instance_id: "main-instance",
        role_id: "MainAgent",
        run_id: "parent_run_1",
        trace_id: "parent_run_1",
        payload_json: JSON.stringify({
          args: {
            description: "Explore skill implementation",
            prompt: "Read the project and report back.",
            role_id: "Explorer",
          },
          tool_call_id: "call-spawn-explorer",
          action_family: "subagent",
          semantic_category: "orchestration",
          tool_name: "spawn_subagent",
        }),
      }),
      relayRunEvent({
        event_id: 3,
        event_type: "thinking_delta",
        role_id: "Explorer",
        run_id: "parent_run_1",
        trace_id: "parent_run_1",
        payload_json: JSON.stringify({
          part_index: 0,
          subagent_instance_id: "explorer-worker",
          subagent_role_id: "Explorer",
          subagent_run_id: "subagent_run_1",
          text: "Parent-run child thought should stay out of the main transcript.",
        }),
      }),
      relayRunEvent({
        event_id: 4,
        event_type: "text_delta",
        role_id: "Explorer",
        run_id: "parent_run_1",
        trace_id: "parent_run_1",
        payload_json: JSON.stringify({
          kind: "subagent",
          run_id: "subagent_run_1",
          text: "Parent-run child output should stay out of the main transcript.",
        }),
      }),
      relayRunEvent({
        event_id: 5,
        event_type: "tool_call",
        role_id: "Explorer",
        run_id: "parent_run_1",
        trace_id: "parent_run_1",
        payload_json: JSON.stringify({
          args: { path: "src/relay_teams/skills/skill_registry.py" },
          subagent_instance_id: "explorer-worker",
          subagent_role_id: "Explorer",
          subagent_run_id: "subagent_run_1",
          tool_call_id: "call-child-read",
          action_family: "read",
          semantic_category: "file-read",
          tool_name: "read",
        }),
      }),
      relayRunEvent({
        event_id: 6,
        event_type: "text_delta",
        role_id: "",
        run_id: "parent_run_1",
        trace_id: "parent_run_1",
        payload_json: JSON.stringify({
          text: "Parent follow-up after child markers should remain visible.",
        }),
      }),
      relayRunEvent({
        event_id: 7,
        event_type: "run_completed",
        role_id: "MainAgent",
        run_id: "parent_run_1",
        trace_id: "parent_run_1",
        payload_json: JSON.stringify({ status: "completed" }),
      }),
    ]);
    listSessionMessagesMock.mockResolvedValue([]);

    const { container } = renderTimeline("session-1");

    expect(
      await screen.findByText(
        "Parent follow-up after child markers should remain visible.",
      ),
    ).toBeVisible();
    expect(
      screen.queryByText("Parent-run child thought should stay out of the main transcript."),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Parent-run child output should stay out of the main transcript."),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Reading: read")).not.toBeInTheDocument();
    expect(container.querySelector('[data-role-id="Explorer"]')).toBeNull();
  });

  it("keeps persisted subagent messages out even when they reuse the parent run id", async () => {
    listSessionRoundsMock.mockResolvedValue({
      has_more: false,
      items: [
        {
          created_at: "2026-06-23T10:00:00Z",
          primary_role_id: "MainAgent",
          run_id: "parent_run_1",
          run_status: "completed",
          run_user_message: "Explore the project",
        },
      ],
      next_cursor: null,
    });
    listSessionMessagesMock.mockResolvedValue([
      {
        content: "Main answer should remain visible.",
        message_id: "main-answer",
        role_id: "MainAgent",
        run_id: "parent_run_1",
      },
      {
        content: "Explorer subagent replay should stay out of the main transcript.",
        instance_id: "87f9f69e-8622-4d46-958f-aa0d7d283095",
        message_id: "subagent-replay-leak",
        role_id: "Explorer",
        run_id: "parent_run_1",
      },
    ]);

    const { container } = renderTimeline("session-1", {
      primaryRoleId: "MainAgent",
    });

    expect(await screen.findByText("Main answer should remain visible."))
      .toBeVisible();
    expect(
      screen.queryByText("Explorer subagent replay should stay out of the main transcript."),
    ).not.toBeInTheDocument();
    expect(container.querySelector('[data-role-id="Explorer"]')).toBeNull();
  });

  it("drops empty persisted thinking rows instead of leaving blank work cards", async () => {
    listSessionMessagesMock.mockResolvedValue([
      {
        message: {
          parts: [
            {
              kind: "thinking",
              part_index: 0,
              text: "",
            },
          ],
        },
        message_id: "empty-thinking",
        role_id: "MainAgent",
        run_id: "run-output",
      },
    ]);

    const { container } = renderTimeline();

    expect(await screen.findByText("No messages yet")).toBeVisible();
    expect(container.querySelector(".at-message-thinking")).toBeNull();
    expect(container.querySelector("article.at-message")).toBeNull();
  });

  it("keeps scoped subagent runs out even when events carry the primary role", async () => {
    setRuntimeEntries(
      [
        runtimeTextDeltaEntry({
          eventId: 1,
          id: "scoped-child-run:1:0",
          instanceId: "22cd6473-7579-438e-90df-d8177cc31e93",
          text: "Scoped subagent output should stay in the subagent panel.",
        }),
      ],
      "open",
      {
        scope: "subagent",
        sessionId: "session-1",
        targetRoleId: "MainAgent",
      },
    );
    listSessionMessagesMock.mockResolvedValue([]);

    const mainTimeline = renderTimeline("session-1", {
      primaryRoleId: "MainAgent",
    });

    expect(await screen.findByText("No messages yet")).toBeVisible();
    expect(
      screen.queryByText("Scoped subagent output should stay in the subagent panel."),
    ).not.toBeInTheDocument();

    mainTimeline.unmount();

    const subagentTimeline = renderTimeline("session-1", {
      runtimeRunId: "run-output",
      variant: "subagent-panel",
    });

    expect(
      await screen.findByText("Scoped subagent output should stay in the subagent panel."),
    ).toBeVisible();
    expect(subagentTimeline.container.querySelectorAll("article.at-message"))
      .toHaveLength(1);
  });

  it("keeps UUID subagent stream rows out while primary role metadata is loading", async () => {
    const subagentInstanceId = "22cd6473-7579-438e-90df-d8177cc31e93";
    const subagentRunId = "87f9f69e-8622-4d46-958f-aa0d7d283095";
    setRuntimeStateFromEvents([
      relayRunEvent({
        event_id: 1,
        event_type: "tool_call",
        instance_id: "main-instance",
        role_id: "MainAgent",
        run_id: "parent_run_1",
        trace_id: "parent_run_1",
        payload_json: JSON.stringify({
          args: {
            description: "Explore skill implementation",
            prompt: "Read the project and report back.",
            role_id: "Explorer",
          },
          tool_call_id: "call-spawn-explorer",
          action_family: "subagent",
          semantic_category: "orchestration",
          tool_name: "spawn_subagent",
        }),
      }),
      relayRunEvent({
        event_id: 2,
        event_type: "thinking_delta",
        instance_id: subagentInstanceId,
        role_id: "Explorer",
        run_id: subagentRunId,
        trace_id: subagentRunId,
        payload_json: JSON.stringify({
          part_index: 0,
          text: "uuid child thought should stay in panel",
        }),
      }),
      relayRunEvent({
        event_id: 3,
        event_type: "text_delta",
        instance_id: subagentInstanceId,
        role_id: "Explorer",
        run_id: subagentRunId,
        trace_id: subagentRunId,
        payload_json: JSON.stringify({
          text: "UUID child output should stay in the subagent panel.",
        }),
      }),
    ]);
    markRuntimeRunAsSubagent(subagentRunId, "Explorer");
    listSessionMessagesMock.mockResolvedValue([]);

    const mainTimeline = renderTimeline("session-1");

    expect(await screen.findByText("Starting subagent")).toBeVisible();
    expect(
      screen.queryByText("uuid child thought should stay in panel"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("UUID child output should stay in the subagent panel."),
    ).not.toBeInTheDocument();
    expect(mainTimeline.container.querySelector('[data-role-id="Explorer"]')).toBeNull();

    mainTimeline.unmount();

    const subagentTimeline = renderTimeline("session-1", {
      runtimeRunId: subagentRunId,
      variant: "subagent-panel",
    });

    expect(
      await screen.findByText("UUID child output should stay in the subagent panel."),
    ).toBeVisible();
    expect(screen.getByText("uuid child thought should stay in panel")).toBeVisible();
    expect(subagentTimeline.container.querySelector(".at-message-role")).toBeNull();
    expect(screen.queryByText("Explorer")).not.toBeInTheDocument();
  });

  it("keeps UUID subagent stream rows out when instance metadata is missing", async () => {
    const subagentRunId = "6d91a928-cb28-4ce2-b9ff-31ec19a15f63";
    setRuntimeStateFromEvents([
      relayRunEvent({
        event_id: 1,
        event_type: "tool_call",
        instance_id: "main-instance",
        role_id: "MainAgent",
        run_id: "parent_run_1",
        trace_id: "parent_run_1",
        payload_json: JSON.stringify({
          args: {
            description: "Explore skill implementation",
            prompt: "Read the project and report back.",
            role_id: "Explorer",
          },
          tool_call_id: "call-spawn-explorer",
          action_family: "subagent",
          semantic_category: "orchestration",
          tool_name: "spawn_subagent",
        }),
      }),
      relayRunEvent({
        event_id: 2,
        event_type: "text_delta",
        role_id: "Explorer",
        run_id: subagentRunId,
        trace_id: subagentRunId,
        payload_json: JSON.stringify({
          text: "Child UUID output without instance id should stay in the subagent panel.",
        }),
      }),
      relayRunEvent({
        event_id: 3,
        event_type: "tool_call",
        role_id: "Explorer",
        run_id: subagentRunId,
        trace_id: subagentRunId,
        payload_json: JSON.stringify({
          args: { path: "src/relay_teams/skills/skill_registry.py" },
          tool_call_id: "call-child-read",
          action_family: "read",
          semantic_category: "file-read",
          tool_name: "read",
        }),
      }),
    ]);
    markRuntimeRunAsSubagent(subagentRunId, "Explorer");
    listSessionMessagesMock.mockResolvedValue([]);

    const mainTimeline = renderTimeline("session-1");

    expect(await screen.findByText("Starting subagent")).toBeVisible();
    expect(
      screen.queryByText(
        "Child UUID output without instance id should stay in the subagent panel.",
      ),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Reading: read")).not.toBeInTheDocument();
    expect(mainTimeline.container.querySelector('[data-role-id="Explorer"]')).toBeNull();

    mainTimeline.unmount();

    const subagentTimeline = renderTimeline("session-1", {
      runtimeRunId: subagentRunId,
      variant: "subagent-panel",
    });

    expect(
      await screen.findByText(
        "Child UUID output without instance id should stay in the subagent panel.",
      ),
    ).toBeVisible();
    expect(await screen.findByText("Reading: read")).toBeVisible();
    expect(subagentTimeline.container.querySelector(".at-message-role")).toBeNull();
  });

  it("renders selected subagent stream without repeated role labels", async () => {
    setRuntimeStateFromEvents([
      relayRunEvent({
        event_id: 1,
        event_type: "thinking_started",
        instance_id: "subagent-instance-1",
        role_id: "Explorer",
        run_id: "subagent_run_1",
        trace_id: "subagent_run_1",
        payload_json: JSON.stringify({ part_index: 0 }),
      }),
      relayRunEvent({
        event_id: 2,
        event_type: "thinking_delta",
        instance_id: "subagent-instance-1",
        role_id: "Explorer",
        run_id: "subagent_run_1",
        trace_id: "subagent_run_1",
        payload_json: JSON.stringify({
          part_index: 0,
          text: "child thought should stay in panel",
        }),
      }),
      relayRunEvent({
        event_id: 3,
        event_type: "text_delta",
        instance_id: "subagent-instance-1",
        role_id: "Explorer",
        run_id: "subagent_run_1",
        trace_id: "subagent_run_1",
        payload_json: JSON.stringify({
          text: "Now let me read all the core source files concurrently.",
        }),
      }),
      relayRunEvent({
        event_id: 4,
        event_type: "tool_call",
        instance_id: "subagent-instance-1",
        role_id: "Explorer",
        run_id: "subagent_run_1",
        trace_id: "subagent_run_1",
        payload_json: JSON.stringify({
          args: { path: "src/relay_teams/skills/__init__.py" },
          tool_call_id: "call-subagent-read",
          action_family: "read",
          semantic_category: "file-read",
          tool_name: "read",
        }),
      }),
    ]);
    listSessionMessagesMock.mockResolvedValue([]);

    const { container } = renderTimeline("session-1", {
      runtimeRunId: "subagent_run_1",
      variant: "subagent-panel",
    });

    expect(
      await screen.findByText("Now let me read all the core source files concurrently."),
    ).toBeVisible();
    expect(screen.getByText("child thought should stay in panel")).toBeVisible();
    expect(await screen.findByText("Reading: read")).toBeVisible();
    expect(container.querySelector(".at-message-role")).toBeNull();
    expect(screen.queryByText("Explorer")).not.toBeInTheDocument();
  });

  it("collapses completed persisted subagent work without leaking thinking into the answer", async () => {
    const thinkingText = "The subagent is checking the requested command.";
    const answerText = "子代理命令执行完成，输出正常。";
    listSessionMessagesMock.mockResolvedValue([
      {
        message: {
          parts: [
            { content: thinkingText, part_kind: "thinking" },
            { content: answerText, part_kind: "text" },
          ],
        },
        message_id: "subagent-final",
        role_id: "Crafter",
        run_id: "subagent_run_done",
      },
    ]);

    const { container } = renderTimeline("session-1", {
      latestTerminalRunId: "subagent_run_done",
      latestTerminalRunStatus: "completed",
      roundsEnabled: false,
      runtimeRunId: "subagent_run_done",
      variant: "subagent-panel",
    });

    expect(await screen.findByText(answerText)).toBeVisible();
    expect(container.querySelector("details.at-processed-group")).not.toBeNull();
    const answerRow = container.querySelector<HTMLElement>("article.at-message");
    expect(answerRow).not.toBeNull();
    expect(answerRow).toHaveTextContent(answerText);
    expect(answerRow).not.toHaveTextContent(thinkingText);
    expect(screen.getAllByText(answerText)).toHaveLength(1);
  });

  it("keeps subagent tool output inside its associated tool disclosure", async () => {
    setRuntimeEntries(
      [
        runtimeGenericEntry({
          id: "subagent-panel-noise:1:0",
          kind: "subagent_session_status_changed",
          text: "subagent session status changed",
          eventId: 1,
          payload: {
            run_phase: "subagent_running",
            status: "running",
            subagent_instance_id: "subagent-instance-1",
            subagent_role_id: "Explorer",
            title: "Explore skill implementation",
          },
        }),
        runtimeGenericEntry({
          id: "subagent-panel-noise:2:1",
          kind: "tool_call",
          text: "shell",
          eventId: 2,
          payload: {
            args: { command: "python stream.py" },
            tool_call_id: "call-subagent-shell",
            action_family: "run",
            semantic_category: "execution",
            tool_name: "shell",
          },
        }),
        runtimeGenericEntry({
          id: "subagent-panel-noise:3:2",
          kind: "background_task_updated",
          text: "background task updated",
          eventId: 3,
          payload: {
            background_task_id: "background-task-1",
            delta: "SUBAGENT_STREAM_1",
            status: "running",
            tool_call_id: "call-subagent-shell",
          },
        }),
        runtimeGenericEntry({
          id: "subagent-panel-noise:4:3",
          kind: "background_task_completed",
          text: "background task completed",
          eventId: 4,
          payload: {
            background_task_id: "background-task-1",
            output_excerpt: "SUBAGENT_STREAM_DONE",
            status: "completed",
          },
        }),
      ],
      "open",
    );
    listSessionMessagesMock.mockResolvedValue([]);

    const { container } = renderTimeline("session-1", {
      runtimeRunId: "run-output",
      variant: "subagent-panel",
    });

    const toolDetails = await waitFor(() => {
      const element = container.querySelector<HTMLDetailsElement>(
        'details[data-tool-call-id="call-subagent-shell"]',
      );
      expect(element).not.toBeNull();
      return element as HTMLDetailsElement;
    });
    expect(container.querySelector(".at-message-text")).toBeNull();
    expect(toolDetails).not.toHaveAttribute("open");
    expect(toolDetails.querySelector(".at-message-tool-preview"))
      .not.toHaveTextContent("SUBAGENT_STREAM_1");

    fireEvent.click(toolDetails.querySelector("summary")!);

    expect(toolDetails).toHaveTextContent("SUBAGENT_STREAM_1");
    expect(screen.queryByText(/Subagent status/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Background task/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Explore skill implementation/)).not.toBeInTheDocument();
    expect(screen.queryByText(/SUBAGENT_STREAM_DONE/)).not.toBeInTheDocument();
  });

  it("isolates a shared orchestration run by subagent instance and task", async () => {
    listSessionMessagesMock.mockResolvedValue([]);
    const selectedEntry = runtimeGenericEntry({
      eventId: 2,
      id: "shared-run:2:selected",
      instanceId: "crafter-instance",
      kind: "text_delta",
      roleId: "Crafter",
      runId: "shared-run",
      taskId: "crafter-task",
      text: "Selected Crafter task output",
    });
    const entries = [
      runtimeGenericEntry({
        eventId: 1,
        id: "shared-run:1:main",
        instanceId: "main-instance",
        kind: "text_delta",
        roleId: "MainAgent",
        runId: "shared-run",
        taskId: "main-task",
        text: "Main coordinator output",
      }),
      selectedEntry,
      runtimeGenericEntry({
        eventId: 3,
        id: "shared-run:3:old-crafter-task",
        instanceId: "crafter-instance",
        kind: "text_delta",
        roleId: "Crafter",
        runId: "shared-run",
        taskId: "old-crafter-task",
        text: "Old Crafter task output",
      }),
      runtimeGenericEntry({
        eventId: 4,
        id: "shared-run:4:explorer",
        instanceId: "explorer-instance",
        kind: "text_delta",
        roleId: "Explorer",
        runId: "shared-run",
        taskId: "explorer-task",
        text: "Explorer sibling output",
      }),
    ];
    setRuntimeEntries(entries, "open");

    const { container } = renderTimeline("session-1", {
      runtimeRunId: "shared-run",
      subagentScopeInstanceId: "crafter-instance",
      subagentScopeRoleId: "Crafter",
      subagentScopeTaskId: "crafter-task",
      variant: "subagent-panel",
    });

    const selectedText = await screen.findByText("Selected Crafter task output");
    const selectedRow = selectedText.closest("article");
    expect(selectedRow).not.toBeNull();
    expect(screen.queryByText("Main coordinator output")).not.toBeInTheDocument();
    expect(screen.queryByText("Old Crafter task output")).not.toBeInTheDocument();
    expect(screen.queryByText("Explorer sibling output")).not.toBeInTheDocument();

    act(() => {
      const current = useRuntimeStore.getState().runtimeState;
      const runState = current.runs["shared-run"];
      if (runState === undefined) {
        throw new Error("shared run missing");
      }
      useRuntimeStore.getState().setRuntimeState({
        ...current,
        runs: {
          ...current.runs,
          "shared-run": {
            ...runState,
            entries: [
              ...runState.entries,
              runtimeGenericEntry({
                eventId: 5,
                id: "shared-run:5:unrelated-explorer-delta",
                instanceId: "explorer-instance",
                kind: "text_delta",
                roleId: "Explorer",
                runId: "shared-run",
                taskId: "explorer-task",
                text: "New unrelated Explorer delta",
              }),
            ],
            lastEventId: 5,
          },
        },
      });
    });

    await waitFor(() => {
      expect(screen.queryByText("New unrelated Explorer delta")).not.toBeInTheDocument();
      expect(container.querySelector("article")).toBe(selectedRow);
    });
  });

  it("does not leave a streaming cursor on a completed subagent stream", async () => {
    setRuntimeStateFromEvents([
      relayRunEvent({
        event_id: 1,
        event_type: "text_delta",
        instance_id: "subagent-instance-1",
        role_id: "Explorer",
        run_id: "subagent_run_done",
        trace_id: "subagent_run_done",
        payload_json: JSON.stringify({ text: "Subagent final answer" }),
      }),
      relayRunEvent({
        event_id: 2,
        event_type: "run_completed",
        instance_id: "subagent-instance-1",
        role_id: "Explorer",
        run_id: "subagent_run_done",
        trace_id: "subagent_run_done",
        payload_json: JSON.stringify({ status: "completed" }),
      }),
    ]);
    listSessionMessagesMock.mockResolvedValue([
      {
        content: "Subagent final answer",
        instance_id: "subagent-instance-1",
        message_id: "subagent-final-answer",
        role_id: "Explorer",
        run_id: "subagent_run_done",
      },
    ]);

    const { container } = renderTimeline("session-1", {
      runtimeRunId: "subagent_run_done",
      variant: "subagent-panel",
    });

    await waitForSingleVisibleText("Subagent final answer");
    await waitFor(() => {
      expect(container.querySelectorAll(".streaming-cursor")).toHaveLength(0);
      expect(container.querySelectorAll(".is-streaming")).toHaveLength(0);
      expect(container.querySelectorAll('[data-streaming="true"]')).toHaveLength(0);
    });
  });

  it("renders MainAgent tool calls before role metadata hydration", async () => {
    setRuntimeStateFromEvents([
      relayRunEvent({
        event_id: 1,
        event_type: "tool_call",
        instance_id: "main-instance",
        role_id: "MainAgent",
        run_id: "run-main-tool",
        trace_id: "run-main-tool",
        payload_json: JSON.stringify({
          args: { description: "Explore skills implementation" },
          tool_call_id: "call-skills",
          action_family: "subagent",
          semantic_category: "orchestration",
          tool_name: "spawn_subagent",
        }),
      }),
    ]);
    listSessionMessagesMock.mockResolvedValue([]);

    const { container } = renderTimeline("session-1", {
      runtimeRunId: "run-main-tool",
    });

    const toolTitle = await screen.findByText("Starting subagent");
    expect(toolTitle).toBeVisible();
    expect(screen.queryByText("Tool call: spawn_subagent")).not.toBeInTheDocument();
    expect(screen.queryByText("No messages yet")).not.toBeInTheDocument();
    expect(toolPreviewTexts(container)).toEqual([
      "Explore skills implementation",
    ]);
    expect(container.querySelectorAll("article.at-message")).toHaveLength(1);

    const toolRow = messageArticle(toolTitle);
    expect(toolRow).toHaveAttribute("data-run-id", "run-main-tool");
    expect(toolRow).toHaveAttribute("data-role-id", "MainAgent");
    expect(toolRow).toHaveAttribute("data-instance-id", "main-instance");
  });

  it("projects paused recovery onto only the matching task for a reused instance", async () => {
    const onSubagentOpen = vi.fn();
    listSessionMessagesMock.mockResolvedValue([{
      message: { parts: [
        {
          action_family: "subagent",
          args: { prompt: "First task", role_id: "Crafter", task_id: "task-a" },
          part_kind: "tool-call",
          tool_call_id: "call-task-a",
          tool_name: "delegated_worker",
        },
        {
          action_family: "subagent",
          content: {
            subagent_instance_id: "shared-instance",
            subagent_role_id: "Crafter",
            task_id: "task-a",
          },
          part_kind: "tool-return",
          tool_call_id: "call-task-a",
          tool_name: "delegated_worker",
        },
        {
          action_family: "subagent",
          args: { prompt: "Second task", role_id: "Crafter", task_id: "task-b" },
          part_kind: "tool-call",
          tool_call_id: "call-task-b",
          tool_name: "delegated_worker",
        },
        {
          action_family: "subagent",
          content: {
            subagent_instance_id: "shared-instance",
            subagent_role_id: "Crafter",
            task_id: "task-b",
          },
          part_kind: "tool-return",
          tool_call_id: "call-task-b",
          tool_name: "delegated_worker",
        },
      ] },
      message_id: "assistant-shared-instance-tasks",
      role_id: "MainAgent",
      run_id: "parent-run",
    }]);

    const { container } = renderTimeline("session-1", {
      onSubagentOpen,
      pausedSubagent: {
        description: "Waiting for follow-up",
        instanceId: "shared-instance",
        roleId: "Crafter",
        runPhase: "awaiting_subagent_followup",
        runStatus: "paused",
        sessionId: "session-1",
        sourceRunId: "parent-run",
        status: "paused",
        taskId: "task-b",
        title: "Crafter",
      },
    });

    await waitFor(() => expect(
      container.querySelector<HTMLElement>('[data-subagent-task-id="task-a"]'),
    ).not.toBeNull());
    const firstTask = container.querySelector<HTMLElement>(
      '[data-subagent-task-id="task-a"]',
    );
    const secondTask = container.querySelector<HTMLElement>(
      '[data-subagent-task-id="task-b"]',
    );
    expect(firstTask).not.toBeNull();
    expect(secondTask).not.toBeNull();
    expect(firstTask).not.toHaveClass("is-paused-subagent");
    expect(secondTask).toHaveClass("is-paused-subagent");
    expect(within(secondTask as HTMLElement).getByText("Needs follow-up")).toBeVisible();
    expect(within(secondTask as HTMLElement).getByText("Continue")).toBeVisible();
    expect(screen.queryByText(/shared-instance|task-b/)).not.toBeInTheDocument();

    fireEvent.click((secondTask as HTMLElement).querySelector("summary") as HTMLElement);
    expect(onSubagentOpen).toHaveBeenCalledWith(expect.objectContaining({
      instanceId: "shared-instance",
      status: "paused",
      taskId: "task-b",
    }));
  });

  it("opens the subagent panel from a completed subagent tool card", async () => {
    const onSubagentOpen = vi.fn();
    setRuntimeStateFromEvents([
      relayRunEvent({
        event_id: 1,
        event_type: "tool_result",
        instance_id: "main-instance",
        role_id: "MainAgent",
        run_id: "run-main-tool",
        trace_id: "run-main-tool",
        payload_json: JSON.stringify({
          result: {
            output: "SUBAGENT_OUTPUT_SHOULD_STAY_IN_PANEL",
            prompt: "Read the project without editing files.",
            subagent_instance_id: "subagent-instance-1",
            subagent_role_id: "explorer",
            subagent_run_id: "subagent_run_1",
            title: "Explore skills implementation",
          },
          tool_call_id: "call-skills",
          action_family: "subagent",
          semantic_category: "orchestration",
          tool_name: "spawn_subagent",
        }),
      }),
    ]);
    listSessionMessagesMock.mockResolvedValue([]);

    const { container } = renderTimeline("session-1", {
      onSubagentOpen,
      runtimeRunId: "run-main-tool",
    });

    fireEvent.click(await screen.findByText("Subagent started"));
    expect(toolPreviewTexts(container)).toEqual([
      "Explore skills implementation",
    ]);
    expect(container.textContent).not.toContain(
      "SUBAGENT_OUTPUT_SHOULD_STAY_IN_PANEL",
    );
    expect(container.textContent).not.toContain(
      "Read the project without editing files.",
    );

    expect(onSubagentOpen).toHaveBeenCalledWith(expect.objectContaining({
      instanceId: "subagent-instance-1",
      roleId: "explorer",
      runId: "subagent_run_1",
      sessionId: "session-1",
      status: "completed",
      title: "Explore skills implementation",
    }));
  });

  it("keeps persisted parent subagent tool cards visible when ids contain subagent", async () => {
    const onSubagentOpen = vi.fn();
    listSessionMessagesMock.mockResolvedValue([
      {
        message: {
          parts: [
            {
              content: {
                subagent_instance_id: "subagent-instance-1",
                subagent_role_id: "explorer",
                subagent_run_id: "subagent_run_1",
                title: "Explorer review",
              },
              kind: "tool-return",
              outcome: "completed",
              tool_call_id: "call-parent-subagent",
              action_family: "subagent",
              semantic_category: "orchestration",
              tool_name: "spawn_subagent",
            },
          ],
        },
        message_id: "parent-subagent-tool",
        role_id: "MainAgent",
        run_id: "run-parent-subagent-tool",
      },
    ]);

    const { container } = renderTimeline("session-1", { onSubagentOpen });

    const title = await screen.findByText("Subagent started");
    const tool = title.closest(".at-message-tool");
    expect(tool).toHaveClass("is-openable-subagent");
    expect(tool).toHaveAttribute("data-tool-name", "spawn_subagent");
    expect(toolPreviewTexts(container)).toEqual(["Explorer review"]);

    fireEvent.click(title);

    expect(onSubagentOpen).toHaveBeenCalledWith(expect.objectContaining({
      instanceId: "subagent-instance-1",
      roleId: "explorer",
      runId: "subagent_run_1",
      sessionId: "session-1",
      title: "Explorer review",
    }));
  });

  it("opens a running subagent tool card before backend ids are hydrated", async () => {
    const onSubagentOpen = vi.fn();
    setRuntimeStateFromEvents([
      relayRunEvent({
        event_id: 1,
        event_type: "tool_call",
        instance_id: "main-instance",
        role_id: "MainAgent",
        run_id: "run-main-tool",
        trace_id: "run-main-tool",
        payload_json: JSON.stringify({
          args: {
            description: "Explore how Skills are implemented in this project",
            prompt: "Explore the project without editing files.",
            role_id: "Explorer",
            run_id: "run-main-tool",
          },
          tool_call_id: "call-running-subagent",
          action_family: "subagent",
          semantic_category: "orchestration",
          tool_name: "spawn_subagent",
        }),
      }),
    ]);
    listSessionMessagesMock.mockResolvedValue([]);

    const { container } = renderTimeline("session-1", {
      onSubagentOpen,
      runtimeRunId: "run-main-tool",
    });

    const title = await screen.findByText("Starting subagent");
    const tool = title.closest(".at-message-tool");
    expect(tool).toHaveClass("is-openable-subagent");
    expect(container.textContent).not.toContain(
      "Explore the project without editing files.",
    );

    fireEvent.click(title);

    const openedSubagent = onSubagentOpen.mock.calls[0]?.[0];
    expect(openedSubagent?.runId ?? "").toBe("");
    expect(onSubagentOpen).toHaveBeenCalledWith(expect.objectContaining({
      description: "Explore how Skills are implemented in this project",
      prompt: "Explore the project without editing files.",
      roleId: "Explorer",
      sessionId: "session-1",
      status: "running",
    }));
    expect(toolPreviewTexts(container)).toEqual([
      "Explore how Skills are implemented in this project",
    ]);
  });

  it("correlates a terminal persisted tool return without embedded subagent ids", async () => {
    const onSubagentOpen = vi.fn();
    const prompt = "Inspect the timeline without editing files.";
    listSessionSubagentsMock.mockResolvedValue([{
      instance_id: "child-instance",
      role_id: "Explorer",
      run_id: "child-run",
      run_status: "completed",
      status: "completed",
      task_id: "child-task",
      title: "Timeline inspection",
    }]);
    listSessionMessagesMock.mockResolvedValue([
      {
        message: { parts: [{
          args: { prompt, role_id: "Explorer" },
          kind: "tool-call",
          tool_call_id: "call-child",
          tool_name: "delegate_worker",
        }] },
        message_id: "parent-call",
        role: "assistant",
        task_id: "parent-task",
        trace_id: "parent-run",
      },
      {
        message: { parts: [{
          content: "The child completed successfully.",
          kind: "tool-return",
          tool_call_id: "call-child",
          tool_name: "delegate_worker",
        }] },
        message_id: "parent-return",
        role: "assistant",
        task_id: "parent-task",
        trace_id: "parent-run",
      },
      {
        content: prompt,
        instance_id: "child-instance",
        message_id: "child-prompt",
        role: "user",
        task_id: "child-task",
        trace_id: "child-run",
      },
    ]);

    const { container } = renderTimeline("session-1", { onSubagentOpen });

    const tool = await waitFor(() => {
      const candidate = container.querySelector<HTMLElement>(
        '[data-tool-call-id="call-child"]',
      );
      expect(candidate).toHaveClass("is-openable-subagent");
      return candidate as HTMLElement;
    });
    expect(tool).toHaveAttribute("data-subagent-instance-id", "child-instance");
    expect(within(tool).getAllByText("Timeline inspection")).toHaveLength(2);

    fireEvent.click(tool.querySelector("summary") as HTMLElement);

    expect(onSubagentOpen).toHaveBeenCalledWith(expect.objectContaining({
      instanceId: "child-instance",
      roleId: "Explorer",
      runId: "child-run",
      sourceRunId: "parent-run",
      sourceToolCallId: "call-child",
      taskId: "child-task",
    }));
  });

  it("uses the source run to disambiguate identical persisted tool call ids", async () => {
    const onSubagentOpen = vi.fn();
    const prompt = "Inspect the selected run.";
    listSessionSubagentsMock.mockResolvedValue([{
      instance_id: "selected-instance",
      role_id: "Explorer",
      run_id: "selected-child-run",
      source_run_id: "parent-run-b",
      source_task_id: "parent-task-b",
      source_tool_call_id: "shared-call-id",
      task_id: "selected-child-task",
      title: "Selected child",
    }]);
    listSessionMessagesMock.mockResolvedValue([
      {
        message: { parts: [{
          args: { prompt, role_id: "Explorer" },
          kind: "tool-call",
          tool_call_id: "shared-call-id",
          tool_name: "delegate_worker",
        }] },
        message_id: "call-a",
        role: "assistant",
        task_id: "parent-task-a",
        trace_id: "parent-run-a",
      },
      {
        message: { parts: [{
          args: { prompt, role_id: "Explorer" },
          kind: "tool-call",
          tool_call_id: "shared-call-id",
          tool_name: "delegate_worker",
        }] },
        message_id: "call-b",
        role: "assistant",
        task_id: "parent-task-b",
        trace_id: "parent-run-b",
      },
    ]);

    const { container } = renderTimeline("session-1", { onSubagentOpen });

    await waitFor(() => expect(
      container.querySelectorAll('[data-tool-call-id="shared-call-id"]'),
    ).toHaveLength(2));
    const tools = Array.from(container.querySelectorAll<HTMLElement>(
      '[data-tool-call-id="shared-call-id"]',
    ));
    expect(tools[0]).not.toHaveClass("is-openable-subagent");
    expect(tools[1]).toHaveClass("is-openable-subagent");

    fireEvent.click(tools[1]?.querySelector("summary") as HTMLElement);

    expect(onSubagentOpen).toHaveBeenCalledTimes(1);
    expect(onSubagentOpen).toHaveBeenCalledWith(expect.objectContaining({
      instanceId: "selected-instance",
      sourceRunId: "parent-run-b",
      sourceToolCallId: "shared-call-id",
    }));
  });

  it("does not correlate a legacy record when the child prompt is ambiguous", async () => {
    const onSubagentOpen = vi.fn();
    const prompt = "Inspect the ambiguous child.";
    listSessionSubagentsMock.mockResolvedValue([{
      instance_id: "ambiguous-instance",
      role_id: "Explorer",
      run_id: "ambiguous-run",
      task_id: "ambiguous-task",
      title: "Ambiguous child",
    }]);
    listSessionMessagesMock.mockResolvedValue([
      {
        message: { parts: [{
          args: { prompt, role_id: "Explorer" },
          kind: "tool-call",
          tool_call_id: "ambiguous-call",
          tool_name: "delegate_worker",
        }] },
        message_id: "ambiguous-parent-call",
        role: "assistant",
        trace_id: "ambiguous-parent-run",
      },
      {
        content: prompt,
        instance_id: "ambiguous-instance",
        message_id: "ambiguous-child-prompt-1",
        role: "user",
        task_id: "ambiguous-task",
        trace_id: "ambiguous-run",
      },
      {
        content: "A later follow-up makes the child source ambiguous.",
        instance_id: "ambiguous-instance",
        message_id: "ambiguous-child-prompt-2",
        role: "user",
        task_id: "ambiguous-task",
        trace_id: "ambiguous-run",
      },
    ]);

    const { container } = renderTimeline("session-1", { onSubagentOpen });

    const tool = await waitFor(() => {
      const candidate = container.querySelector<HTMLElement>(
        '[data-tool-call-id="ambiguous-call"]',
      );
      expect(candidate).not.toBeNull();
      return candidate as HTMLElement;
    });
    expect(tool).not.toHaveClass("is-openable-subagent");
    fireEvent.click(tool.querySelector("summary") as HTMLElement);
    expect(onSubagentOpen).not.toHaveBeenCalled();
  });

  it.each([
    ["explicit generic action", { action_family: "generic" as const }],
    ["explicit file-read semantics", { semantic_category: "file-read" as const }],
  ])("does not override %s from structural arguments", async (_label, semantics) => {
    const onSubagentOpen = vi.fn();
    const prompt = "Inspect a non-subagent tool.";
    listSessionSubagentsMock.mockResolvedValue([{
      instance_id: "semantic-instance",
      role_id: "Explorer",
      run_id: "semantic-run",
      task_id: "semantic-task",
      title: "Semantic conflict",
    }]);
    listSessionMessagesMock.mockResolvedValue([
      {
        message: { parts: [{
          ...semantics,
          args: { prompt, role_id: "Explorer" },
          kind: "tool-call",
          tool_call_id: "semantic-call",
          tool_name: "delegate_worker",
        }] },
        message_id: "semantic-parent-call",
        role: "assistant",
        trace_id: "semantic-parent-run",
      },
      {
        content: prompt,
        instance_id: "semantic-instance",
        message_id: "semantic-child-prompt",
        role: "user",
        task_id: "semantic-task",
        trace_id: "semantic-run",
      },
    ]);

    const { container } = renderTimeline("session-1", { onSubagentOpen });

    const tool = await waitFor(() => {
      const candidate = container.querySelector<HTMLElement>(
        '[data-tool-call-id="semantic-call"]',
      );
      expect(candidate).not.toBeNull();
      return candidate as HTMLElement;
    });
    expect(tool).not.toHaveClass("is-openable-subagent");
    fireEvent.click(tool.querySelector("summary") as HTMLElement);
    expect(onSubagentOpen).not.toHaveBeenCalled();
  });

  it("keeps the submitted prompt and real answer out of verification presentation messages", async () => {
    const verificationPresentation =
      "The task finished, but verification did not pass. Review the result.";
    listSessionMessagesMock.mockResolvedValue([
      {
        content: "Build the requested feature",
        message_id: "user-real",
        role: "user",
        trace_id: "run-verification-projection",
      },
      {
        content: "# Real coordinator answer",
        message_id: "assistant-real",
        role: "assistant",
        role_id: "Coordinator",
        trace_id: "run-verification-projection",
      },
      {
        content: verificationPresentation,
        message_id: "assistant-verification-presentation",
        role: "assistant",
        role_id: "Coordinator",
        trace_id: "run-verification-projection",
      },
    ]);
    listSessionRoundsMock.mockResolvedValue({
      has_more: false,
      items: [
        {
          coordinator_messages: [
            {
              content: "# Real coordinator answer",
              role: "assistant",
              role_id: "Coordinator",
            },
            {
              content: verificationPresentation,
              role: "assistant",
              role_id: "Coordinator",
            },
          ],
          created_at: "2026-06-23T12:42:33Z",
          intent: "Build the requested feature",
          intent_parts: [{ kind: "text", text: "Build the requested feature" }],
          primary_role_id: "Coordinator",
          run_id: "run-verification-projection",
          run_status: "completed",
          run_user_message: verificationPresentation,
          verification_status: "failed",
        },
      ],
      next_cursor: null,
    });

    const { container } = renderTimeline("session-1", {
      primaryRoleId: "Coordinator",
    });

    expect(await screen.findByRole("heading", { name: "Real coordinator answer" }))
      .toBeVisible();
    expect(screen.queryByText(verificationPresentation)).not.toBeInTheDocument();
    expect(screen.getByRole("button", {
      name: "Go to round 1: Build the requested feature",
    })).toBeVisible();
    const userRows = Array.from(container.querySelectorAll("article.at-message"))
      .filter((row) => row.textContent?.includes("Build the requested feature"));
    expect(userRows).toHaveLength(0);
    expect(container.querySelector(".at-round-marker")).toHaveTextContent(
      "Build the requested feature",
    );
  });

  it("projects only the structured orchestration main agent into the session transcript", async () => {
    const runId = "run-structured-orchestration-projection";
    const prompt = "Inspect the real orchestration transcript";
    const verificationPresentation = "Verification presentation only";
    listSessionMessagesMock.mockResolvedValue([
      {
        agent_role_id: "RenamedPrimaryAgent",
        content: prompt,
        created_at: "2026-07-12T14:03:08Z",
        instance_id: "instance-primary",
        role: "user",
        trace_id: runId,
      },
      {
        agent_role_id: "RenamedWorkerAgent",
        content: "Worker-internal delegated prompt",
        created_at: "2026-07-12T14:03:09Z",
        instance_id: "instance-worker",
        role: "user",
        trace_id: runId,
      },
      {
        agent_role_id: "RenamedWorkerAgent",
        content: "Worker raw answer must stay in the subagent panel",
        created_at: "2026-07-12T14:03:10Z",
        instance_id: "instance-worker",
        role: "assistant",
        trace_id: runId,
      },
      {
        agent_role_id: "RenamedPrimaryAgent",
        content: "# Primary final answer",
        created_at: "2026-07-12T14:03:11Z",
        instance_id: "instance-primary",
        role: "assistant",
        trace_id: runId,
      },
      {
        agent_role_id: "RenamedPrimaryAgent",
        content: verificationPresentation,
        created_at: "2026-07-12T14:03:12Z",
        instance_id: "instance-primary",
        role: "assistant",
        trace_id: runId,
      },
    ]);
    listSessionRoundsMock.mockResolvedValue({
      has_more: false,
      items: [{
        coordinator_messages: [{
          agent_role_id: "RenamedPrimaryAgent",
          content: "# Primary final answer",
          instance_id: "instance-primary",
          role: "assistant",
          role_id: "RenamedPrimaryAgent",
        }, {
          agent_role_id: "RenamedPrimaryAgent",
          content: verificationPresentation,
          instance_id: "instance-primary",
          role: "assistant",
          role_id: "RenamedPrimaryAgent",
        }],
        created_at: "2026-07-12T14:03:08Z",
        intent: prompt,
        intent_parts: [{ kind: "text", text: prompt }],
        primary_role_id: "RenamedPrimaryAgent",
        run_id: runId,
        run_status: "completed",
        run_user_message: verificationPresentation,
        verification_status: "failed",
      }],
      next_cursor: null,
    });

    const { container } = renderTimeline("session-1", {
      // A normal-mode default must not override the round's structured main role.
      primaryRoleId: "MainAgent",
    });

    expect(await screen.findByRole("heading", { name: "Primary final answer" }))
      .toBeVisible();
    expect(screen.queryByText("Worker-internal delegated prompt"))
      .not.toBeInTheDocument();
    expect(screen.queryByText("Worker raw answer must stay in the subagent panel"))
      .not.toBeInTheDocument();
    expect(screen.queryByText(verificationPresentation)).not.toBeInTheDocument();
    expect(container.querySelector(".at-round-marker")).toHaveTextContent(prompt);
    expect(container.querySelectorAll('[data-instance-id="instance-worker"]'))
      .toHaveLength(0);
  });

  it("keeps persisted worker tools out when the main session has an active fallback run", async () => {
    const runId = "run-active-orchestration-projection";
    const workerToolMessage = {
      agent_role_id: "RenamedWorkerAgent",
      instance_id: "instance-worker",
      message: {
        parts: [{
          args: { command: "echo ORCH_LINE_001" },
          part_kind: "tool-call" as const,
          tool_call_id: "call-worker-shell",
          action_family: "run" as const,
          semantic_category: "execution" as const,
          tool_name: "shell",
        }],
      },
      role: "assistant",
      role_id: "RenamedWorkerAgent",
      trace_id: runId,
    };
    const sameRoleWorkerToolMessage = {
      agent_role_id: "RenamedPrimaryAgent",
      instance_id: "instance-worker-same-role",
      message: {
        parts: [{
          args: { path: "worker-only.txt" },
          part_kind: "tool-call" as const,
          tool_call_id: "call-same-role-worker-read",
          action_family: "read" as const,
          semantic_category: "file-read" as const,
          tool_name: "read",
        }],
      },
      role: "assistant",
      role_id: "RenamedPrimaryAgent",
      trace_id: runId,
    };
    listSessionMessagesMock.mockResolvedValue([
      workerToolMessage,
      sameRoleWorkerToolMessage,
      {
        agent_role_id: "RenamedPrimaryAgent",
        content: "Primary output remains visible.",
        instance_id: "instance-primary",
        role: "assistant",
        trace_id: runId,
      },
    ]);
    listSessionRoundsMock.mockResolvedValue({
      has_more: false,
      items: [{
        coordinator_messages: [
          {
            agent_role_id: "RenamedPrimaryAgent",
            content: "Primary output remains visible.",
            instance_id: "instance-primary",
            role: "assistant",
            role_id: "RenamedPrimaryAgent",
          },
          workerToolMessage,
          sameRoleWorkerToolMessage,
        ],
        intent: "Delegate the shell work",
        primary_role_id: "RenamedPrimaryAgent",
        role_instance_map: {
          RenamedPrimaryAgent: "instance-primary",
        },
        run_id: runId,
        run_status: "running",
      }],
      next_cursor: null,
    });

    const { container } = renderTimeline("session-1", {
      fallbackRunId: runId,
      primaryRoleId: "NormalModeDefault",
    });

    expect(await screen.findByText("Primary output remains visible.")).toBeVisible();
    expect(screen.queryByText("Running: shell")).not.toBeInTheDocument();
    expect(screen.queryByText("Reading: read")).not.toBeInTheDocument();
    expect(container.querySelector('[data-instance-id="instance-worker"]'))
      .toBeNull();
    expect(container.querySelector('[data-instance-id="instance-worker-same-role"]'))
      .toBeNull();
  });

  it("keeps a renamed orchestration root stream when the normal-mode role differs", async () => {
    setRuntimeEntries([{
      eventId: 1,
      id: "renamed-root:1:0",
      kind: "text_delta",
      occurredAt: "2026-07-12T14:03:08Z",
      payload: { text: "renamed root live output" },
      roleId: "RenamedPrimaryAgent",
      runId: "renamed-root",
      sessionId: "session-1",
      text: "renamed root live output",
    }], "open", {
      targetRoleId: "RenamedPrimaryAgent",
    });
    listSessionMessagesMock.mockResolvedValue([]);

    renderTimeline("session-1", {
      primaryRoleId: "NormalModeDefault",
    });

    expect(await screen.findByText("renamed root live output")).toBeVisible();
  });

  it("does not expose an unscoped partial transcript while round identity is loading", async () => {
    const runId = "run-delayed-identity";
    let resolveRounds!: (value: Awaited<ReturnType<typeof listSessionRounds>>) => void;
    listSessionMessagesMock.mockResolvedValue([{
      agent_role_id: "RenamedWorkerAgent",
      content: "wrong-scope worker output",
      instance_id: "instance-worker",
      role: "assistant",
      trace_id: runId,
    }, {
      agent_role_id: "RenamedPrimaryAgent",
      content: "correct primary output",
      instance_id: "instance-primary",
      role: "assistant",
      trace_id: runId,
    }]);
    listSessionRoundsMock.mockReturnValue(new Promise((resolve) => {
      resolveRounds = resolve;
    }));

    const { container } = renderTimeline("session-1", {
      primaryRoleId: "NormalModeDefault",
    });
    await waitFor(() => expect(listSessionMessagesMock).toHaveBeenCalled());
    expect(container.querySelector(".ant-skeleton")).not.toBeNull();
    expect(screen.queryByText("wrong-scope worker output")).not.toBeInTheDocument();
    expect(screen.queryByText("correct primary output")).not.toBeInTheDocument();

    resolveRounds({
      has_more: false,
      items: [{
        coordinator_messages: [],
        intent: "real prompt",
        primary_role_id: "RenamedPrimaryAgent",
        run_id: runId,
        run_status: "completed",
      }],
      next_cursor: null,
    });

    expect(await screen.findByText("correct primary output")).toBeVisible();
    expect(screen.queryByText("wrong-scope worker output")).not.toBeInTheDocument();
  });

  it("preserves one openable card across the synchronous subagent event sequence", async () => {
    const onSubagentOpen = vi.fn();
    const toolCallEvent = relayRunEvent({
      event_id: 1,
      event_type: "tool_call",
      instance_id: "main-instance",
      role_id: "MainAgent",
      run_id: "run-main-tool",
      trace_id: "run-main-tool",
      payload_json: JSON.stringify({
        args: {
          description: "Inspect the active session",
          prompt: "Inspect without editing files.",
          role_id: "Explorer",
        },
        tool_call_id: "call-running-subagent",
        action_family: "subagent",
        semantic_category: "orchestration",
        tool_name: "spawn_subagent",
      }),
    });
    const runningStatusEvent = relayRunEvent({
      event_id: 1,
      event_type: "subagent_session_status_changed",
      instance_id: "subagent-instance-1",
      role_id: "Explorer",
      run_id: "subagent-run-1",
      trace_id: "subagent-run-1",
      payload_json: JSON.stringify({
        parent_run_id: "run-main-tool",
        parent_session_id: "session-1",
        run_phase: "subagent_running",
        run_status: "running",
        status: "running",
        subagent_instance_id: "subagent-instance-1",
        subagent_role_id: "Explorer",
        subagent_run_id: "subagent-run-1",
        title: "Inspect the active session",
      }),
    });
    setRuntimeStateFromEvents([toolCallEvent, runningStatusEvent]);
    listSessionMessagesMock.mockResolvedValue([]);

    const { container } = renderTimeline("session-1", {
      onSubagentOpen,
    });

    const runningTitle = await screen.findByText("Starting subagent");
    const runningCard = runningTitle.closest(".at-message-tool");
    expect(runningCard).toHaveClass("is-openable-subagent");
    expect(runningCard).toHaveAttribute("data-status", "running");
    expect(container.querySelectorAll(".at-message-tool")).toHaveLength(1);
    fireEvent.click(runningTitle);
    expect(onSubagentOpen).toHaveBeenLastCalledWith(expect.objectContaining({
      description: "Inspect the active session",
      roleId: "Explorer",
      status: "running",
    }));
    onSubagentOpen.mockClear();

    act(() => {
      setRuntimeStateFromEvents([
        toolCallEvent,
        runningStatusEvent,
        relayRunEvent({
          event_id: 2,
          event_type: "subagent_session_status_changed",
          instance_id: "subagent-instance-1",
          role_id: "Explorer",
          run_id: "subagent-run-1",
          trace_id: "subagent-run-1",
          payload_json: JSON.stringify({
            parent_run_id: "run-main-tool",
            parent_session_id: "session-1",
            run_phase: "terminal",
            run_status: "completed",
            status: "completed",
            subagent_instance_id: "subagent-instance-1",
            subagent_role_id: "Explorer",
            subagent_run_id: "subagent-run-1",
            title: "Inspect the active session",
          }),
        }),
        relayRunEvent({
          event_id: 2,
          event_type: "tool_result",
          instance_id: "main-instance",
          role_id: "MainAgent",
          run_id: "run-main-tool",
          trace_id: "run-main-tool",
          payload_json: JSON.stringify({
            result: {
              data: {
                completed: true,
                output: "Subagent completed successfully.",
              },
              meta: { tool_result_event_published: true },
              ok: true,
            },
            tool_call_id: "call-running-subagent",
            action_family: "subagent",
            semantic_category: "orchestration",
            tool_name: "spawn_subagent",
          }),
        }),
      ]);
    });

    const completedTitle = await screen.findByText("Subagent started");
    const completedCard = completedTitle.closest(".at-message-tool");
    expect(container.querySelectorAll(".at-message-tool")).toHaveLength(1);
    expect(completedCard).toBe(runningCard);
    expect(completedCard).toHaveAttribute("data-status", "completed");
    expect(completedCard).toHaveAttribute("data-subagent-instance-id", "");
    expect(completedCard).toHaveAttribute("data-subagent-run-id", "");

    fireEvent.click(completedTitle);
    expect(onSubagentOpen).toHaveBeenLastCalledWith(expect.objectContaining({
      description: "Inspect the active session",
      roleId: "Explorer",
      status: "completed",
    }));
  });

  it("keeps subagent orphan messages out of the main session timeline", async () => {
    listSessionMessagesMock.mockResolvedValue([
      {
        agent_role_id: "Explorer",
        content: "Explore how Skills are implemented in this project",
        created_at: "2026-06-23T10:00:00Z",
        instance_id: "22cd6473-7579-438e-90df-d8177cc31e93",
        message_id: "explorer-message",
        role_id: "explorer",
        run_id: "87f9f69e-8622-4d46-958f-aa0d7d283095",
      },
      {
        agent_role_id: "MainAgent",
        content: "Skill 系统的实现总结如下",
        created_at: "2026-06-23T10:03:00Z",
        instance_id: "main-instance",
        message_id: "parent-message",
        role_id: "MainAgent",
        run_id: "parent_run_1",
      },
    ]);
    listSessionRoundsMock.mockResolvedValue({
      has_more: false,
      items: [
        {
          created_at: "2026-06-23T10:02:00Z",
          primary_role_id: "MainAgent",
          run_id: "parent_run_1",
          run_status: "completed",
          run_user_message: "看一下当前项目，不要修改。看一下skill是怎么实现的",
        },
      ],
      next_cursor: null,
    });

    renderTimeline("session-1", { primaryRoleId: "MainAgent" });

    expect(await screen.findByText("Skill 系统的实现总结如下")).toBeVisible();
    expect(
      screen.queryByText("Explore how Skills are implemented in this project"),
    ).not.toBeInTheDocument();
  });

  it("keeps orphan subagent messages out before round metadata hydrates", async () => {
    listSessionMessagesMock.mockResolvedValue([
      {
        content: "Now let me read all the core source files concurrently.",
        created_at: "2026-06-23T10:00:00Z",
        instance_id: "87f9f69e-8622-4d46-958f-aa0d7d283095",
        message_id: "explorer-message-without-round",
        role_id: "Explorer",
        run_id: "subagent_run_1",
      },
      {
        content: "Skill 系统的实现总结如下",
        created_at: "2026-06-23T10:03:00Z",
        instance_id: "main-instance",
        message_id: "parent-message-without-round",
        role_id: "MainAgent",
        run_id: "parent_run_1",
      },
    ]);
    listSessionRoundsMock.mockResolvedValue({
      has_more: false,
      items: [],
      next_cursor: null,
    });

    const { container } = renderTimeline("session-1", {
      primaryRoleId: "MainAgent",
    });

    expect(await screen.findByText("Skill 系统的实现总结如下")).toBeVisible();
    expect(
      screen.queryByText("Now let me read all the core source files concurrently."),
    ).not.toBeInTheDocument();
    expect(container.querySelector('[data-role-id="Explorer"]')).toBeNull();
  });

  it("keeps UUID subagent replay messages out when instance metadata is missing", async () => {
    listSessionMessagesMock.mockResolvedValue([
      {
        agent_role_id: "Explorer",
        content: "Child replay without instance id should stay out of the main transcript.",
        created_at: "2026-06-23T10:00:00Z",
        message_id: "explorer-message-without-instance",
        role_id: "Explorer",
        run_id: "6d91a928-cb28-4ce2-b9ff-31ec19a15f63",
      },
      {
        agent_role_id: "MainAgent",
        content: "Parent summary should remain visible.",
        created_at: "2026-06-23T10:03:00Z",
        instance_id: "main-instance",
        message_id: "parent-message-without-instance",
        role_id: "MainAgent",
        run_id: "parent_run_1",
      },
    ]);
    listSessionRoundsMock.mockResolvedValue({
      has_more: false,
      items: [],
      next_cursor: null,
    });

    const { container } = renderTimeline("session-1", {
      primaryRoleId: "MainAgent",
    });

    expect(await screen.findByText("Parent summary should remain visible."))
      .toBeVisible();
    expect(
      screen.queryByText(
        "Child replay without instance id should stay out of the main transcript.",
      ),
    ).not.toBeInTheDocument();
    expect(container.querySelector('[data-role-id="Explorer"]')).toBeNull();
  });

  it("keeps explicitly referenced UUID subagent runtime streams out of the main timeline", async () => {
    const childRunId = "87f9f69e-8622-4d46-958f-aa0d7d283095";
    setRuntimeStateFromEvents([
      relayRunEvent({
        event_id: 1,
        event_type: "tool_result",
        instance_id: "main-instance",
        payload_json: JSON.stringify({
          result: {
            subagent_instance_id: "22cd6473-7579-438e-90df-d8177cc31e93",
            subagent_role_id: "Explorer",
            subagent_run_id: childRunId,
            title: "Explore skill implementation",
          },
          tool_call_id: "call-subagent",
          action_family: "subagent",
          semantic_category: "orchestration",
          tool_name: "spawn_subagent",
        }),
        role_id: "MainAgent",
        run_id: "run-main-tool",
        trace_id: "run-main-tool",
      }),
      relayRunEvent({
        event_id: 2,
        event_type: "text_delta",
        payload_json: JSON.stringify({
          text: "Now let me read all the core source files concurrently.",
        }),
        role_id: "Explorer",
        run_id: childRunId,
        trace_id: childRunId,
      }),
      relayRunEvent({
        event_id: 3,
        event_type: "tool_call",
        payload_json: JSON.stringify({
          args: { path: "src/relay_teams/skills/__init__.py" },
          tool_call_id: "call-child-read",
          action_family: "read",
          semantic_category: "file-read",
          tool_name: "read",
        }),
        role_id: "Explorer",
        run_id: childRunId,
        trace_id: childRunId,
      }),
    ]);
    listSessionMessagesMock.mockResolvedValue([]);
    listSessionRoundsMock.mockResolvedValue({
      has_more: false,
      items: [],
      next_cursor: null,
    });

    const { container } = renderTimeline("session-1", {
      primaryRoleId: "MainAgent",
    });

    expect(await screen.findByText("Subagent started")).toBeVisible();
    expect(
      screen.queryByText("Now let me read all the core source files concurrently."),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Reading: read")).not.toBeInTheDocument();
    expect(container.querySelector(`[data-run-id="${childRunId}"]`)).toBeNull();
    expect(container.querySelector('[data-role-id="Explorer"]')).toBeNull();
  });

  it("keeps unmarked child-role runtime rows out after a subagent tool reference", async () => {
    setRuntimeStateFromEvents([
      relayRunEvent({
        event_id: 1,
        event_type: "tool_result",
        instance_id: "main-instance",
        payload_json: JSON.stringify({
          result: {
            subagent_instance_id: "22cd6473-7579-438e-90df-d8177cc31e93",
            subagent_role_id: "Explorer",
            subagent_run_id: "87f9f69e-8622-4d46-958f-aa0d7d283095",
            title: "Explore skill implementation",
          },
          tool_call_id: "call-subagent",
          action_family: "subagent",
          semantic_category: "orchestration",
          tool_name: "spawn_subagent",
        }),
        role_id: "MainAgent",
        run_id: "run-main-tool",
        trace_id: "run-main-tool",
      }),
      relayRunEvent({
        event_id: 2,
        event_type: "text_delta",
        payload_json: JSON.stringify({
          subagent_instance_id: "22cd6473-7579-438e-90df-d8177cc31e93",
          subagent_role_id: "Explorer",
          subagent_run_id: "87f9f69e-8622-4d46-958f-aa0d7d283095",
          text: "Now let me read all the core source files concurrently.",
        }),
        role_id: "Explorer",
        run_id: "run-main-tool",
        trace_id: "run-main-tool",
      }),
      relayRunEvent({
        event_id: 3,
        event_type: "tool_call",
        payload_json: JSON.stringify({
          args: { path: "src/relay_teams/skills/__init__.py" },
          subagent_instance_id: "22cd6473-7579-438e-90df-d8177cc31e93",
          subagent_role_id: "Explorer",
          subagent_run_id: "87f9f69e-8622-4d46-958f-aa0d7d283095",
          tool_call_id: "call-child-read",
          action_family: "read",
          semantic_category: "file-read",
          tool_name: "read",
        }),
        role_id: "Explorer",
        run_id: "run-main-tool",
        trace_id: "run-main-tool",
      }),
      relayRunEvent({
        event_id: 4,
        event_type: "text_delta",
        payload_json: JSON.stringify({
          text: "Parent summary should remain visible.",
        }),
        role_id: "MainAgent",
        run_id: "run-main-tool",
        trace_id: "run-main-tool",
      }),
    ]);
    listSessionMessagesMock.mockResolvedValue([]);
    listSessionRoundsMock.mockResolvedValue({
      has_more: false,
      items: [],
      next_cursor: null,
    });

    const { container } = renderTimeline("session-1", {
      primaryRoleId: "MainAgent",
    });

    expect(await screen.findByText("Subagent started")).toBeVisible();
    expect(await screen.findByText("Parent summary should remain visible."))
      .toBeVisible();
    expect(
      screen.queryByText("Now let me read all the core source files concurrently."),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("src/relay_teams/skills/__init__.py"))
      .not.toBeInTheDocument();
    expect(container.querySelector('[data-role-id="Explorer"]')).toBeNull();
  });

  it("keeps subagent round messages injected from replay out of the main timeline", async () => {
    listSessionMessagesMock.mockResolvedValue([]);
    listSessionRoundsMock.mockResolvedValue({
      has_more: false,
      items: [
        {
          coordinator_messages: [
            {
              agent_role_id: "MainAgent",
              content: "Crafter 子代理成功执行命令，运行正常。",
              message_id: "parent-final",
              role: "assistant",
              role_id: "MainAgent",
            },
          ],
          created_at: "2026-06-23T10:02:00Z",
          primary_role_id: "MainAgent",
          run_id: "parent_run_1",
          run_status: "completed",
          run_user_message: "启动 Crafter 子代理验证运行中可打开面板",
        },
        {
          coordinator_messages: [
            {
              agent_role_id: "Crafter",
              content: "SUBOPEN_1\nSUBOPEN_2\nSUBOPEN_DONE",
              message_id: "subagent-output",
              role: "assistant",
              role_id: "Crafter",
            },
          ],
          created_at: "2026-06-23T10:03:00Z",
          primary_role_id: "MainAgent",
          run_id: "subagent_run_e56e8720cddb",
          run_status: "completed",
          run_user_message: "执行指定 shell 命令",
        },
      ],
      next_cursor: null,
    });

    const { container } = renderTimeline("session-1", {
      primaryRoleId: "MainAgent",
    });

    expect(await screen.findByText("Crafter 子代理成功执行命令，运行正常。"))
      .toBeVisible();
    expect(screen.queryByText(/SUBOPEN_1/)).not.toBeInTheDocument();
    expect(screen.queryByText(/SUBOPEN_DONE/)).not.toBeInTheDocument();
    expect(container.querySelector('[data-role-id="Crafter"]')).toBeNull();
  });

  it("keeps internal orchestration planner replay messages out of the main timeline", async () => {
    listSessionMessagesMock.mockResolvedValue([
      {
        content: "Run orchestration tool pressure.",
        message_id: "orchestration-user",
        role: "user",
        run_id: "run-orchestration",
      },
      {
        agent_role_id: "DelegationPlanner",
        content: "Return only the delegation plan JSON object.",
        message_id: "planner-prompt",
        role_id: "DelegationPlanner",
        run_id: "run-orchestration",
        visibility: "internal",
      },
      {
        content: (
          "Return only the delegation plan JSON object. " +
          "Do not include Markdown fences or explanatory prose."
        ),
        message_id: "planner-prompt-unscoped",
        role: "assistant",
        run_id: "run-orchestration",
        visibility: "internal",
      },
      {
        agent_role_id: "DelegationPlanner",
        content: "[fake-llm] Return only the delegation plan JSON object",
        message_id: "planner-output",
        role_id: "DelegationPlanner",
        run_id: "run-orchestration",
        visibility: "internal",
      },
      {
        agent_role_id: "Coordinator",
        content: "Coordinator final answer stays visible.",
        message_id: "coordinator-final",
        role: "assistant",
        role_id: "Coordinator",
        run_id: "run-orchestration",
      },
    ]);
    listSessionRoundsMock.mockResolvedValue({
      has_more: false,
      items: [{
        primary_role_id: "Coordinator",
        run_id: "run-orchestration",
        run_status: "completed",
      }],
      next_cursor: null,
    });

    const { container } = renderTimeline("session-1", {
      primaryRoleId: "Coordinator",
    });

    expect(await screen.findByText("Coordinator final answer stays visible."))
      .toBeVisible();
    expect(screen.getByText("Run orchestration tool pressure.")).toBeVisible();
    expect(screen.queryByText("Return only the delegation plan JSON object."))
      .not.toBeInTheDocument();
    expect(screen.queryByText(
      "Return only the delegation plan JSON object. " +
        "Do not include Markdown fences or explanatory prose.",
    )).not.toBeInTheDocument();
    expect(screen.queryByText("[fake-llm] Return only the delegation plan JSON object"))
      .not.toBeInTheDocument();
    expect(container.querySelector('[data-role-id="DelegationPlanner"]')).toBeNull();
  });

  it("keeps internal orchestration planner stream rows out of the main timeline", async () => {
    setRuntimeStateFromEvents([
      relayRunEvent({
        event_id: 0,
        event_type: "run_started",
        role_id: "Coordinator",
        run_id: "run-orchestration-live",
        trace_id: "run-orchestration-live",
        payload_json: JSON.stringify({ phase: "streaming" }),
      }),
      relayRunEvent({
        event_id: 1,
        event_type: "text_delta",
        payload_json: JSON.stringify({
          subagent_role_id: "DelegationPlanner",
          subagent_run_id: "run-orchestration-planner-live",
          text: "Planner stream should not render.",
        }),
        role_id: "DelegationPlanner",
        run_id: "run-orchestration-live",
        trace_id: "run-orchestration-live",
      }),
      relayRunEvent({
        event_id: 2,
        event_type: "text_delta",
        payload_json: JSON.stringify({
          text: "Coordinator stream remains visible.",
        }),
        role_id: "Coordinator",
        run_id: "run-orchestration-live",
        trace_id: "run-orchestration-live",
      }),
    ]);
    listSessionMessagesMock.mockResolvedValue([]);
    listSessionRoundsMock.mockResolvedValue({
      has_more: false,
      items: [],
      next_cursor: null,
    });

    const { container } = renderTimeline("session-1", {
      primaryRoleId: "Coordinator",
    });

    expect(await screen.findByText("Coordinator stream remains visible."))
      .toBeVisible();
    expect(screen.queryByText("Planner stream should not render."))
      .not.toBeInTheDocument();
    expect(container.querySelector('[data-role-id="DelegationPlanner"]')).toBeNull();
  });

  it("keeps orchestration coordinator tools visible while hiding dispatched worker rows", async () => {
    setRuntimeStateFromEvents([
      relayRunEvent({
        event_id: 1,
        event_type: "run_started",
        instance_id: "00386a5a-133d-4b08-8037-458047f2522a",
        role_id: "Coordinator",
        run_id: "cef60ea9-c6ec-4ea1-ae4a-8195440c46e9",
        trace_id: "cef60ea9-c6ec-4ea1-ae4a-8195440c46e9",
        payload_json: JSON.stringify({ phase: "streaming" }),
      }),
      relayRunEvent({
        event_id: 2,
        event_type: "text_delta",
        instance_id: "00386a5a-133d-4b08-8037-458047f2522a",
        role_id: "DelegationPlanner",
        run_id: "cef60ea9-c6ec-4ea1-ae4a-8195440c46e9",
        trace_id: "cef60ea9-c6ec-4ea1-ae4a-8195440c46e9",
        payload_json: JSON.stringify({
          subagent_role_id: "DelegationPlanner",
          subagent_run_id: "run-orchestration-planner",
          text: "Return only the delegation plan JSON object.",
        }),
      }),
      relayRunEvent({
        event_id: 3,
        event_type: "tool_call",
        instance_id: "00386a5a-133d-4b08-8037-458047f2522a",
        role_id: "Coordinator",
        run_id: "cef60ea9-c6ec-4ea1-ae4a-8195440c46e9",
        trace_id: "cef60ea9-c6ec-4ea1-ae4a-8195440c46e9",
        payload_json: JSON.stringify({
          args: {
            prompt: "Complete dispatched tool pressure worker.",
            role_id: "Crafter",
            task_id: "worker-task-1",
          },
          tool_call_id: "call-orch-tool-pressure-dispatch-1",
          action_family: "subagent",
          semantic_category: "orchestration",
          tool_name: "orch_dispatch_task",
        }),
      }),
      relayRunEvent({
        event_id: 4,
        event_type: "text_delta",
        instance_id: "339d6dac-b322-4151-8130-61ccc18913f8",
        role_id: "Crafter",
        run_id: "cef60ea9-c6ec-4ea1-ae4a-8195440c46e9",
        trace_id: "cef60ea9-c6ec-4ea1-ae4a-8195440c46e9",
        payload_json: JSON.stringify({
          subagent_role_id: "Crafter",
          subagent_run_id: "run-orchestration-worker",
          text: "Dispatched worker output should stay out of main timeline.",
        }),
      }),
      relayRunEvent({
        event_id: 5,
        event_type: "tool_call",
        instance_id: "339d6dac-b322-4151-8130-61ccc18913f8",
        role_id: "Crafter",
        run_id: "cef60ea9-c6ec-4ea1-ae4a-8195440c46e9",
        trace_id: "cef60ea9-c6ec-4ea1-ae4a-8195440c46e9",
        payload_json: JSON.stringify({
          args: { command: "echo worker" },
          subagent_role_id: "Crafter",
          subagent_run_id: "run-orchestration-worker",
          tool_call_id: "call-worker-shell",
          action_family: "run",
          semantic_category: "execution",
          tool_name: "shell",
        }),
      }),
    ]);
    listSessionMessagesMock.mockResolvedValue([]);
    listSessionRoundsMock.mockResolvedValue({
      has_more: false,
      items: [],
      next_cursor: null,
    });

    const { container } = renderTimeline("session-1", {
      primaryRoleId: "Coordinator",
    });

    expect(await screen.findByText("Starting subagent")).toBeVisible();
    expect(screen.queryByText("Return only the delegation plan JSON object."))
      .not.toBeInTheDocument();
    expect(screen.queryByText(
      "Dispatched worker output should stay out of main timeline.",
    )).not.toBeInTheDocument();
    expect(screen.queryByText("Running: shell")).not.toBeInTheDocument();
    expect(container.querySelector('[data-role-id="Crafter"]')).toBeNull();
    expect(container.querySelector('[data-role-id="Coordinator"]')).not.toBeNull();
  });

  it("keeps a valid round when one replayed coordinator message belongs to a child", async () => {
    listSessionMessagesMock.mockResolvedValue([]);
    listSessionRoundsMock.mockResolvedValue({
      has_more: false,
      items: [{
        coordinator_messages: [
          {
            agent_role_id: "Coordinator",
            content: "valid root answer",
            instance_id: "instance-root",
            message_id: "root-answer",
            role: "assistant",
            role_id: "Coordinator",
            task_id: "task-root",
          },
          {
            agent_role_id: "Coordinator",
            content: "leaked same-role child answer",
            instance_id: "instance-child",
            message_id: "child-answer",
            role: "assistant",
            role_id: "Coordinator",
            task_id: "task-child",
          },
        ],
        primary_instance_id: "instance-root",
        primary_role_id: "Coordinator",
        primary_task_id: "task-root",
        run_id: "run-mixed-replay",
        run_status: "completed",
        run_user_message: "real user prompt",
      }],
      next_cursor: null,
    });

    renderTimeline("session-1", { primaryRoleId: "Coordinator" });

    expect(await screen.findByText("valid root answer")).toBeVisible();
    expect(screen.getAllByText("real user prompt").some((element) =>
      element.closest(".at-round-marker") !== null
    )).toBe(true);
    expect(screen.queryByText("leaked same-role child answer"))
      .not.toBeInTheDocument();
  });

  it("uses task and instance identity before dispatch-tool presentation", async () => {
    listSessionMessagesMock.mockResolvedValue([
      {
        agent_role_id: "RenamedPrimary",
        instance_id: "instance-child",
        task_id: "task-child",
        message_id: "child-dispatch-tool",
        role: "assistant",
        role_id: "RenamedPrimary",
        run_id: "run-structured-identity",
        message: { parts: [{
          args: { role_id: "NestedWorker" },
          part_kind: "tool-call",
          tool_call_id: "call-child-dispatch",
          action_family: "subagent",
          semantic_category: "orchestration",
          tool_name: "spawn_subagent",
        }] },
      },
      {
        agent_role_id: "RenamedPrimary",
        instance_id: "instance-root",
        task_id: "task-root",
        message_id: "root-renamed-dispatch-tool",
        role: "assistant",
        role_id: "RenamedPrimary",
        run_id: "run-structured-identity",
        message: { parts: [{
          args: { subagent_instance_id: "instance-child" },
          part_kind: "tool-call",
          tool_call_id: "call-root-custom-dispatch",
          tool_name: "renamed_dispatch_contract",
        }] },
      },
      {
        agent_role_id: "RenamedPrimary",
        content: "root final remains visible",
        instance_id: "instance-root",
        task_id: "task-root",
        message_id: "root-final-structured-identity",
        role: "assistant",
        role_id: "RenamedPrimary",
        run_id: "run-structured-identity",
      },
    ]);
    listSessionRoundsMock.mockResolvedValue({
      has_more: false,
      items: [{
        primary_instance_id: "instance-root",
        primary_role_id: "RenamedPrimary",
        primary_task_id: "task-root",
        run_id: "run-structured-identity",
        run_status: "completed",
      }],
      next_cursor: null,
    });

    const { container } = renderTimeline("session-1", {
      primaryRoleId: "UnrelatedDefault",
    });

    expect(await screen.findByText("root final remains visible")).toBeVisible();
    expect(container.querySelector('[data-tool-name="renamed_dispatch_contract"]'))
      .not.toBeNull();
    expect(container.querySelector('[data-tool-name="spawn_subagent"]')).toBeNull();
    expect(container.querySelector('[data-instance-id="instance-child"]')).toBeNull();
  });

  it("keeps unmarked same-role child instance events out of the main runtime timeline", async () => {
    setRuntimeStateFromEvents([
      relayRunEvent({
        event_id: 1,
        event_type: "run_started",
        instance_id: "coordinator-root-instance",
        role_id: "Coordinator",
        run_id: "run-same-role-child",
        trace_id: "run-same-role-child",
        payload_json: JSON.stringify({ phase: "streaming" }),
      }),
      relayRunEvent({
        event_id: 2,
        event_type: "text_delta",
        instance_id: "coordinator-child-instance",
        role_id: "Coordinator",
        run_id: "run-same-role-child",
        trace_id: "run-same-role-child",
        payload_json: JSON.stringify({ text: "same-role child output must stay hidden" }),
      }),
      relayRunEvent({
        event_id: 3,
        event_type: "tool_call",
        instance_id: "coordinator-child-instance",
        role_id: "Coordinator",
        run_id: "run-same-role-child",
        trace_id: "run-same-role-child",
        payload_json: JSON.stringify({
          args: { command: "echo child" },
          tool_call_id: "call-same-role-child-shell",
          action_family: "run",
          semantic_category: "execution",
          tool_name: "shell",
        }),
      }),
      relayRunEvent({
        event_id: 4,
        event_type: "text_delta",
        instance_id: "coordinator-root-instance",
        role_id: "Coordinator",
        run_id: "run-same-role-child",
        trace_id: "run-same-role-child",
        payload_json: JSON.stringify({ text: "root coordinator output remains visible" }),
      }),
    ]);
    listSessionMessagesMock.mockResolvedValue([]);

    const { container } = renderTimeline("session-1", {
      primaryRoleId: "Coordinator",
    });

    expect(await screen.findByText("root coordinator output remains visible"))
      .toBeVisible();
    expect(screen.queryByText("same-role child output must stay hidden"))
      .not.toBeInTheDocument();
    expect(screen.queryByText("Running: shell")).not.toBeInTheDocument();
    expect(container.querySelector('[data-instance-id="coordinator-child-instance"]'))
      .toBeNull();
  });

  it("uses authoritative round identity when a recovered stream sees the child first", async () => {
    setRuntimeStateFromEvents([
      relayRunEvent({
        event_id: 1,
        event_type: "run_started",
        instance_id: undefined,
        role_id: "RenamedPrimary",
        run_id: "run-recovered-child-first",
        trace_id: "run-recovered-child-first",
      }),
      relayRunEvent({
        event_id: 2,
        event_type: "text_delta",
        instance_id: "instance-child",
        role_id: "RenamedPrimary",
        run_id: "run-recovered-child-first",
        trace_id: "run-recovered-child-first",
        payload_json: JSON.stringify({ text: "child arrived first" }),
      }),
      relayRunEvent({
        event_id: 3,
        event_type: "text_delta",
        instance_id: "instance-root",
        role_id: "RenamedPrimary",
        run_id: "run-recovered-child-first",
        trace_id: "run-recovered-child-first",
        payload_json: JSON.stringify({ text: "authoritative root output" }),
      }),
    ]);
    listSessionMessagesMock.mockResolvedValue([]);
    listSessionRoundsMock.mockResolvedValue({
      has_more: false,
      items: [{
        primary_instance_id: "instance-root",
        primary_role_id: "RenamedPrimary",
        primary_task_id: "task-root",
        run_id: "run-recovered-child-first",
        run_status: "running",
      }],
      next_cursor: null,
    });

    const { container } = renderTimeline("session-1", {
      primaryRoleId: "UnrelatedDefault",
    });

    await waitFor(() => {
      expect(screen.getByText("authoritative root output")).toBeVisible();
      expect(screen.queryByText("child arrived first")).not.toBeInTheDocument();
      expect(container.querySelector('[data-instance-id="instance-child"]')).toBeNull();
    });
  });

  it("keeps same-role runtime streams separate by instance identity", async () => {
    setRuntimeStateFromEvents([
      relayRunEvent({
        event_id: 1,
        event_type: "text_delta",
        instance_id: "writer-instance-a",
        role_id: "writer",
        run_id: "run-output",
        trace_id: "run-output",
        payload_json: JSON.stringify({ text: "first instance output" }),
      }),
      relayRunEvent({
        event_id: 2,
        event_type: "text_delta",
        instance_id: "writer-instance-b",
        role_id: "writer",
        run_id: "run-output",
        trace_id: "run-output",
        payload_json: JSON.stringify({ text: "second instance output" }),
      }),
      relayRunEvent({
        event_id: 3,
        event_type: "text_delta",
        instance_id: "writer-instance-a",
        role_id: "writer",
        run_id: "run-output",
        trace_id: "run-output",
        payload_json: JSON.stringify({ text: " still first" }),
      }),
    ]);
    listSessionMessagesMock.mockResolvedValue([]);

    const { container } = renderTimeline("session-1", {
      runtimeRunId: "run-output",
    });

    expect(
      await screen.findByText("first instance output still first"),
    ).toBeVisible();
    expect(screen.getByText("second instance output")).toBeVisible();

    const rowTexts = Array.from(
      container.querySelectorAll("article.at-message"),
    ).map((row) => row.textContent ?? "");
    expect(rowTexts).toHaveLength(2);
    expect(
      rowTexts.some(
        (text) =>
          text.includes("first instance output still first") &&
          !text.includes("second instance output"),
      ),
    ).toBe(true);
    expect(
      rowTexts.some(
        (text) =>
          text.includes("second instance output") &&
          !text.includes("first instance output"),
      ),
    ).toBe(true);
  });

  it("renders external primary runtime text on the selected run stream", async () => {
    setRuntimeStateFromEvents([
      relayRunEvent({
        event_id: 1,
        event_type: "text_delta",
        instance_id: "external-instance",
        role_id: "external-role",
        run_id: "run-acp",
        trace_id: "run-acp",
        payload_json: JSON.stringify({ text: "streamed from external ACP" }),
      }),
    ]);
    listSessionMessagesMock.mockResolvedValue([]);

    const { container } = renderTimeline("session-1", {
      runtimeRunId: "run-acp",
    });

    expect(await screen.findByText("streamed from external ACP")).toBeVisible();
    expect(container.querySelectorAll("article.at-message")).toHaveLength(1);
    expect(container.querySelector("article.at-message"))
      .toHaveAttribute("data-run-id", "run-acp");
  });

  it("renders external primary runtime media references on the selected run stream", async () => {
    setRuntimeStateFromEvents([
      relayRunEvent({
        event_id: 1,
        event_type: "output_delta",
        instance_id: "external-instance",
        role_id: "external-role",
        run_id: "run-acp",
        trace_id: "run-acp",
        payload_json: JSON.stringify({
          output: [
            {
              kind: "media_ref",
              mime_type: "image/png",
              modality: "image",
              name: "external-image.png",
              url: "data:image/png;base64,AAA",
            },
          ],
        }),
      }),
    ]);
    listSessionMessagesMock.mockResolvedValue([]);

    const { container } = renderTimeline("session-1", {
      runtimeRunId: "run-acp",
    });

    const image = await screen.findByRole("img", { name: "external-image.png" });
    expect(image).toHaveAttribute("src", "data:image/png;base64,AAA");
    expect(screen.getByText("external-image.png")).toBeVisible();
    expect(screen.queryByText("output delta")).not.toBeInTheDocument();
    expect(container.querySelectorAll("article.at-message")).toHaveLength(1);
    expect(container.querySelector("article.at-message"))
      .toHaveAttribute("data-run-id", "run-acp");
  });

  it("keeps completed runtime tool results when stale tool calls arrive later", async () => {
    setRuntimeStateFromEvents([
      relayRunEvent({
        event_id: 2,
        event_type: "tool_result",
        payload_json: JSON.stringify({
          result: { ok: true, output: "done" },
          tool_call_id: "call-b",
          action_family: "run",
          semantic_category: "execution",
          tool_name: "shell",
        }),
      }),
      relayRunEvent({
        event_id: 1,
        event_type: "tool_call",
        payload_json: JSON.stringify({
          args: { command: "echo b" },
          tool_call_id: "call-b",
          action_family: "run",
          semantic_category: "execution",
          tool_name: "shell",
        }),
      }),
    ]);
    listSessionMessagesMock.mockResolvedValue([]);

    const { container } = renderTimeline();

    const resultTitle = await screen.findByText("Ran: shell");
    expect(resultTitle).toBeVisible();
    expect(screen.queryByText("Running: shell")).not.toBeInTheDocument();
    expect(screen.queryByText("echo b")).not.toBeInTheDocument();
    expect(toolPreviewTexts(container)).toEqual(["done"]);
    const resultDetails = toolPreElement(screenElement(resultTitle));
    expect(resultDetails).not.toBeVisible();
    expect(resultDetails).toHaveTextContent(/done/);
    fireEvent.click(resultTitle);
    expect(resultDetails).toBeVisible();
    expect(container.querySelectorAll(".streaming-cursor")).toHaveLength(1);
    expect(container.querySelectorAll("article.at-message")).toHaveLength(2);
  });

  it("renders runtime tool result media_ref previews", async () => {
    setRuntimeStateFromEvents([
      relayRunEvent({
        event_id: 1,
        event_type: "tool_result",
        payload_json: JSON.stringify({
          result: {
            data: {
              content: [
                {
                  kind: "media_ref",
                  mime_type: "image/png",
                  modality: "image",
                  name: "runtime-tool.png",
                  url: "/api/sessions/session-1/media/runtime-tool/file",
                },
              ],
              type: "image",
            },
            ok: true,
          },
          tool_call_id: "call-runtime-image",
          action_family: "read",
          semantic_category: "file-read",
          tool_name: "read",
        }),
      }),
    ]);
    listSessionMessagesMock.mockResolvedValue([]);

    const { container } = renderTimeline();

    const resultTitle = await screen.findByText("Read: read");
    expect(resultTitle).toBeVisible();
    fireEvent.click(resultTitle);
    const image = await screen.findByRole("img", { name: "runtime-tool.png" });
    expect(image).toHaveAttribute(
      "src",
      "/api/sessions/session-1/media/runtime-tool/file",
    );
    expect(container.querySelectorAll(".at-message-tool .at-message-media"))
      .toHaveLength(1);
    expect(container.querySelectorAll(".streaming-cursor")).toHaveLength(1);
  });

  it("renders runtime tool results without a prior tool call", async () => {
    setRuntimeStateFromEvents([
      relayRunEvent({
        event_id: 1,
        event_type: "tool_result",
        payload_json: JSON.stringify({
          result: {
            ok: false,
            error: { message: "boom" },
          },
          tool_call_id: "call-9",
          action_family: "read",
          semantic_category: "file-read",
          tool_name: "read",
        }),
        run_id: "run-tool-result-only",
        trace_id: "run-tool-result-only",
      }),
    ]);
    listSessionMessagesMock.mockResolvedValue([]);

    const { container } = renderTimeline("session-1", {
      runtimeRunId: "run-tool-result-only",
    });

    const resultTitle = await screen.findByText("Read failed: read");
    expect(resultTitle).toBeVisible();
    expect(screen.queryByText("Reading: read")).not.toBeInTheDocument();
    expect(toolPreviewTexts(container)).toEqual(["boom"]);
    const resultDetails = toolPreElement(screenElement(resultTitle));
    expect(resultDetails).not.toBeVisible();
    expect(resultDetails).toHaveTextContent(/boom/);
    fireEvent.click(resultTitle);
    expect(resultDetails).toBeVisible();
    expect(container.querySelectorAll(".streaming-cursor")).toHaveLength(1);
    expect(container.querySelectorAll("article.at-message")).toHaveLength(2);
  });

  it("renders late tool results after terminal stream finalization", async () => {
    setRuntimeStateFromEvents([
      relayRunEvent({
        event_id: 1,
        event_type: "tool_call",
        payload_json: JSON.stringify({
          args: { command: "cat report.txt" },
          tool_call_id: "call-finalized",
          action_family: "run",
          semantic_category: "execution",
          tool_name: "shell",
        }),
      }),
      relayRunEvent({
        event_id: 2,
        event_type: "run_completed",
        payload_json: JSON.stringify({ status: "completed" }),
      }),
      relayRunEvent({
        event_id: 3,
        event_type: "tool_result",
        payload_json: JSON.stringify({
          result: { ok: true, output: "late finalized result" },
          tool_call_id: "call-finalized",
          action_family: "run",
          semantic_category: "execution",
          tool_name: "shell",
        }),
      }),
    ]);
    listSessionMessagesMock.mockResolvedValue([]);

    const { container } = renderTimeline("session-1", {
      runtimeRunId: "run-output",
    });

    expect(screen.queryByText("Running: shell")).not.toBeInTheDocument();
    expect(screen.queryByText("Run completed: status completed")).not.toBeInTheDocument();
    expect(await screen.findByText("Processed")).toBeVisible();
    const resultTitle = await screen.findByText("Ran: shell");
    expect(resultTitle).not.toBeVisible();
    openProcessedGroup(container);
    expect(resultTitle).toBeVisible();
    expect(toolPreviewTexts(container)).toEqual(["late finalized result"]);
    const resultDetails = toolPreElement(screenElement(resultTitle));
    expect(resultDetails).not.toBeVisible();
    expect(resultDetails).toHaveTextContent(/late finalized result/);
    expect(resultDetails).toHaveTextContent(/cat report.txt/);
    expect(screenElement(resultTitle).closest(".at-message-tool"))
      .toHaveAttribute("data-status", "completed");
    expect(container.querySelector(".at-message-streaming-text")).toBeNull();
    expect(container.querySelectorAll(".streaming-cursor")).toHaveLength(0);
    expect(container.querySelectorAll("article.at-message")).toHaveLength(0);
  });

  it("keeps hydrated text and idle continuation after a reconnected tool result", async () => {
    useRuntimeStore.setState({
      runtimeState: {
        activeRunIds: ["run-rebind-tool"],
        runs: {
          "run-rebind-tool": {
            runId: "run-rebind-tool",
            status: "open",
            lastEventId: 3,
            seenEventKeys: [],
            terminalEventType: null,
            entries: [
              {
                id: "run-rebind-tool:1:0",
                sessionId: "session-1",
                runId: "run-rebind-tool",
                roleId: "MainAgent",
                kind: "text_delta",
                text: "hello",
                payload: { text: "hello" },
                eventId: 1,
                occurredAt: "2026-06-23T00:00:00Z",
              },
              {
                id: "run-rebind-tool:2:1",
                sessionId: "session-1",
                runId: "run-rebind-tool",
                roleId: "MainAgent",
                kind: "tool_call",
                text: "shell",
                payload: {
                  args: { command: "echo hi" },
                  tool_call_id: "call-rebind",
                  action_family: "run",
                  semantic_category: "execution",
                  tool_name: "shell",
                },
                eventId: 2,
                occurredAt: "2026-06-23T00:00:01Z",
              },
              {
                id: "run-rebind-tool:3:2",
                sessionId: "session-1",
                runId: "run-rebind-tool",
                roleId: "MainAgent",
                kind: "tool_result",
                text: "shell",
                payload: {
                  result: { ok: true, data: "done" },
                  tool_call_id: "call-rebind",
                  action_family: "run",
                  semantic_category: "execution",
                  tool_name: "shell",
                },
                eventId: 3,
                occurredAt: "2026-06-23T00:00:02Z",
              },
            ],
          },
        },
      },
    });
    listSessionMessagesMock.mockResolvedValue([
      {
        agent_role_id: "MainAgent",
        message_id: "assistant-1",
        role: "assistant",
        role_id: "MainAgent",
        run_id: "run-rebind-tool",
        content: "hello",
      },
    ]);

    const { container } = renderTimeline("session-1", {
      runtimeRunId: "run-rebind-tool",
    });

    await waitForSingleVisibleText("hello");
    expect(screen.queryByText("Running: shell")).not.toBeInTheDocument();
    const resultTitle = await screen.findByText("Ran: shell");
    expect(resultTitle).toBeVisible();
    await waitForToolPreviews(container, ["done"]);
    const resultDetails = toolPreElement(screenElement(resultTitle));
    expect(resultDetails).toHaveTextContent(/done/);
    expect(resultDetails).toHaveTextContent(/echo hi/);
    await waitFor(() => {
      const streamingText = container.querySelector<HTMLElement>(
        ".at-message-streaming-text",
      );
      expect(streamingText).not.toBeNull();
      expect(streamingText).not.toHaveTextContent("hello");
      expect(streamingText).not.toHaveTextContent("done");
    });
    expect(container.querySelectorAll(".streaming-cursor")).toHaveLength(1);
    expect(container.querySelectorAll("article.at-message")).toHaveLength(3);
  });

  it("merges out-of-order parallel runtime tool calls into completed results", async () => {
    setRuntimeStateFromEvents([
      relayRunEvent({
        event_id: 1,
        event_type: "tool_result",
        instance_id: "worker-b",
        role_id: "Runner",
        payload_json: JSON.stringify({
          result: { ok: true, output: "b done" },
          tool_call_id: "call-b",
          action_family: "run",
          semantic_category: "execution",
          tool_name: "shell",
        }),
      }),
      relayRunEvent({
        event_id: 2,
        event_type: "tool_call",
        instance_id: "worker-a",
        role_id: "Runner",
        payload_json: JSON.stringify({
          args: { command: "echo a" },
          tool_call_id: "call-a",
          action_family: "run",
          semantic_category: "execution",
          tool_name: "shell",
        }),
      }),
      relayRunEvent({
        event_id: 3,
        event_type: "tool_call",
        instance_id: "worker-b",
        role_id: "Runner",
        payload_json: JSON.stringify({
          args: { command: "echo b" },
          tool_call_id: "call-b",
          action_family: "run",
          semantic_category: "execution",
          tool_name: "shell",
        }),
      }),
    ]);
    listSessionMessagesMock.mockResolvedValue([]);

    const { container } = renderTimeline();

    const resultTitle = await screen.findByText("Ran: shell");
    expect(screen.getByText("Running: shell")).toBeVisible();
    expect(container.querySelectorAll(".at-message-tool")).toHaveLength(2);
    const resultTool = screenElement(resultTitle).closest(".at-message-tool");
    expect(resultTool).toHaveAttribute("data-status", "completed");
    expect(resultTool?.querySelector(".at-message-tool-spinner")).toBeNull();
    expect(toolPreviewTexts(container)).toEqual(["b done", "echo a"]);
    const resultDetails = toolPreElement(screenElement(resultTitle));
    expect(resultDetails.textContent).toContain("echo b");
    const resultRow = messageArticle(resultTitle);
    expect(resultRow).toHaveAttribute("data-run-id", "run-output");
    expect(resultRow).toHaveAttribute("data-role-id", "Runner");
    expect(resultRow).toHaveAttribute("data-instance-id", "worker-b");
    const pendingCallRow = messageArticle(screen.getByText("Running: shell"));
    expect(pendingCallRow).toHaveAttribute("data-run-id", "run-output");
    expect(pendingCallRow).toHaveAttribute("data-role-id", "Runner");
    expect(pendingCallRow).toHaveAttribute("data-instance-id", "worker-a");
    const pendingTool = screenElement(screen.getByText("Running: shell"))
      .closest(".at-message-tool");
    expect(pendingTool).toHaveAttribute("data-status", "running");
    expect(pendingTool?.querySelector(".at-message-tool-spinner")).not.toBeNull();
    expect(container.querySelector(".at-message-tool-status")).toBeNull();
  });

  it("keeps same-name runtime tool calls separate when call ids are missing", async () => {
    setRuntimeStateFromEvents([
      relayRunEvent({
        event_id: 1,
        event_type: "tool_call",
        payload_json: JSON.stringify({
          args: { command: "pwd" },
          action_family: "run",
          semantic_category: "execution",
          tool_name: "shell",
        }),
      }),
      relayRunEvent({
        event_id: 2,
        event_type: "tool_call",
        payload_json: JSON.stringify({
          args: { command: "ls" },
          action_family: "run",
          semantic_category: "execution",
          tool_name: "shell",
        }),
      }),
    ]);
    listSessionMessagesMock.mockResolvedValue([]);

    const { container } = renderTimeline();

    expect(await screen.findAllByText("Running: shell")).toHaveLength(2);
    expect(container.querySelectorAll(".at-message-tool")).toHaveLength(2);
    expect(toolPreviewTexts(container)).toEqual(["pwd", "ls"]);
    const toolDetails = toolPreElements(container);
    expect(toolDetails).toHaveLength(2);
    expect(toolDetails[0]).toHaveTextContent(/pwd/);
    expect(toolDetails[1]).toHaveTextContent(/ls/);
  });

  it("unwraps successful tool return envelopes to the useful output", async () => {
    listSessionMessagesMock.mockResolvedValue([
      {
        message: {
          parts: [
            {
              content: {
                data: {
                  output_excerpt: "tests/integration_tests/frontend/test_a.py::test_ok",
                  recent_output: ["ignored fallback"],
                  status: "completed",
                },
                error: null,
                meta: { duration_ms: 42 },
                ok: true,
              },
              part_kind: "tool-return",
              tool_call_id: "tool-1",
              action_family: "run",
              semantic_category: "execution",
              tool_name: "shell",
            },
          ],
        },
        message_id: "assistant-success-tool",
        role_id: "MainAgent",
      },
    ]);

    renderTimeline();

    const resultTitle = await screen.findByText("Ran: shell");
    expect(resultTitle).toBeVisible();
    expect(toolPreviewTexts(screenElement(resultTitle))).toEqual([
      "tests/integration_tests/frontend/test_a.py::test_ok",
    ]);
    expect(screen.queryByText(/"ok": true/)).not.toBeInTheDocument();
    expect(screen.queryByText(/duration_ms/)).not.toBeInTheDocument();

    fireEvent.click(resultTitle);

    const resultDetails = toolPreElement(screenElement(resultTitle));
    expect(resultDetails).toBeVisible();
    expect(resultDetails).toHaveTextContent(
      /tests\/integration_tests\/frontend\/test_a.py::test_ok/,
    );
    expect(screen.queryByText(/"ok": true/)).not.toBeInTheDocument();
    expect(screen.queryByText(/duration_ms/)).not.toBeInTheDocument();
  });

  it("uses registry semantics to parse renamed file reads and bound output previews", async () => {
    const longDiff = Array.from({ length: 240 }, (_value, index) =>
      `+ generated diff line ${index}`,
    ).join("\n");
    listSessionMessagesMock.mockResolvedValue([
      {
        message: {
          parts: [
            {
              content: [
                "<path>src/main.py</path>",
                "<type>text</type>",
                "<content>",
                "def main():",
                "    return 'ok'",
                "</content>",
              ].join("\n"),
              action_family: "read",
              part_kind: "tool-return",
              semantic_category: "file-read",
              tool_call_id: "tool-read-tagged",
              tool_name: "renamed_reader",
            },
            {
              content: {
                data: { output: longDiff },
                ok: true,
              },
              action_family: "edit",
              part_kind: "tool-return",
              semantic_category: "file-edit",
              tool_call_id: "tool-write-large",
              tool_name: "write",
            },
          ],
        },
        message_id: "assistant-tagged-tools",
        role_id: "MainAgent",
      },
    ]);

    const { container } = renderTimeline();

    const readTitle = await screen.findByText("Read: renamed_reader");
    const writeTitle = screen.getByText("Edited: write");
    expect(toolPreviewTexts(container)).toEqual([
      "Path: src/main.py",
      "+ generated diff line 0",
    ]);

    fireEvent.click(readTitle);
    const readDetails = toolPreElement(screenElement(readTitle));
    expect(readDetails).toBeVisible();
    expect(readDetails).toHaveTextContent(/Path: src\/main\.py/);
    expect(readDetails).toHaveTextContent(/Type: text/);
    expect(readDetails).toHaveTextContent(/def main\(\):/);
    expect(readDetails).not.toHaveTextContent(/<content>/);

    fireEvent.click(writeTitle);
    const writeDetails = toolPreElement(screenElement(writeTitle));
    expect(writeDetails).toBeVisible();
    expect(writeDetails).toHaveTextContent(/\+ generated diff line 0/);
    expect(writeDetails).toHaveTextContent(/\+ generated diff line 199/);
    expect(writeDetails).not.toHaveTextContent(/\+ generated diff line 220/);
    expect(writeDetails).toHaveTextContent(
      /Preview truncated\. Showing first 200 of 240 lines\./,
    );
  });

  it("marks failed persisted tool returns as tool errors", async () => {
    listSessionMessagesMock.mockResolvedValue([
      {
        message: {
          parts: [
            {
              content: "explicit tool failure",
              is_error: true,
              part_kind: "tool-return",
              tool_call_id: "tool-1",
              action_family: "run",
              semantic_category: "execution",
              tool_name: "execute_command",
            },
            {
              content: "denied by policy",
              outcome: "denied",
              part_kind: "tool-return",
              tool_call_id: "tool-2",
              action_family: "run",
              semantic_category: "execution",
              tool_name: "execute_command",
            },
            {
              content: { error: "cd failed", ok: false },
              part_kind: "tool-return",
              tool_call_id: "tool-3",
              action_family: "run",
              semantic_category: "execution",
              tool_name: "execute_command",
            },
            {
              content: {
                data: null,
                error: {
                  message: "File not found: .",
                  retryable: false,
                  type: "validation_error",
                },
                ok: false,
              },
              part_kind: "tool-return",
              tool_call_id: "tool-4",
              action_family: "read",
              semantic_category: "file-read",
              tool_name: "read",
            },
          ],
        },
        message_id: "assistant-failed-tools",
        role_id: "MainAgent",
      },
    ]);

    const { container } = renderTimeline();

    const errorTitles = await screen.findAllByText("Run failed: execute_command");
    const readErrorTitle = await screen.findByText("Read failed: read");
    expect(errorTitles).toHaveLength(3);
    expect(readErrorTitle).toBeVisible();
    expect(toolPreviewTexts(container)).toEqual([
      "explicit tool failure",
      "denied by policy",
      "cd failed",
      "File not found: .",
    ]);
    for (const details of toolPreElements(container)) {
      expect(details).not.toBeVisible();
    }
    expect(screen.queryByText(/"ok": false/)).not.toBeInTheDocument();
    expect(screen.queryByText(/"error": "cd failed"/)).not.toBeInTheDocument();

    fireEvent.click(errorTitles[2]);

    const failedDetails = toolPreElement(screenElement(errorTitles[2]));
    expect(failedDetails).toBeVisible();
    expect(failedDetails).toHaveTextContent("cd failed");
    expect(screen.queryByText(/"ok": false/)).not.toBeInTheDocument();
    expect(screen.queryByText(/"error": "cd failed"/)).not.toBeInTheDocument();

    fireEvent.click(readErrorTitle);

    const readDetails = toolPreElement(screenElement(readErrorTitle));
    expect(readDetails).toBeVisible();
    expect(readDetails).toHaveTextContent(/File not found/);
    expect(readDetails).toHaveTextContent(/Type: validation_error/);
    expect(readDetails).toHaveTextContent(/Retryable: false/);
  });

  it("renders round-only injections inside tool-heavy persisted history", async () => {
    listSessionMessagesMock.mockResolvedValue([
      {
        created_at: "2026-04-29T10:00:00Z",
        message: {
          parts: [
            {
              args: { command: "ls missing" },
              part_kind: "tool-call",
              tool_call_id: "call-1",
              action_family: "run",
              semantic_category: "execution",
              tool_name: "shell",
            },
          ],
        },
        message_id: "tool-call-1",
        role_id: "MainAgent",
        run_id: "run-1",
      },
      {
        created_at: "2026-04-29T10:00:01Z",
        message: {
          parts: [
            {
              content: "Shell command failed",
              is_error: true,
              part_kind: "tool-return",
              tool_call_id: "call-1",
              action_family: "run",
              semantic_category: "execution",
              tool_name: "shell",
            },
          ],
        },
        message_id: "tool-return-1",
        role: "user",
        run_id: "run-1",
      },
      {
        content: "Now let me read more files.",
        created_at: "2026-04-29T10:00:02Z",
        message_id: "assistant-more",
        role_id: "MainAgent",
        run_id: "run-1",
      },
      {
        created_at: "2026-04-29T10:00:02.500Z",
        message: {
          parts: [
            {
              args: { path: "plugin_cli.py" },
              part_kind: "tool-call",
              tool_call_id: "call-2",
              action_family: "read",
              semantic_category: "file-read",
              tool_name: "read_file",
            },
          ],
        },
        message_id: "tool-call-2",
        role_id: "MainAgent",
        run_id: "run-1",
      },
      {
        created_at: "2026-04-29T10:00:02.750Z",
        message: {
          parts: [
            {
              content: "file content",
              part_kind: "tool-return",
              tool_call_id: "call-2",
              action_family: "read",
              semantic_category: "file-read",
              tool_name: "read_file",
            },
          ],
        },
        message_id: "tool-return-2",
        role: "user",
        run_id: "run-1",
      },
      {
        content: "done",
        created_at: "2026-04-29T10:00:03Z",
        message_id: "assistant-done",
        role_id: "MainAgent",
        run_id: "run-1",
      },
    ]);
    listSessionRoundsMock.mockResolvedValue({
      has_more: false,
      items: [
        {
          created_at: "2026-04-29T09:59:59Z",
          injection_messages: [
            {
              content: "change direction",
              created_at: "2026-04-29T10:00:01.500Z",
              entry_type: "injection",
              injection_id: "inj-1",
              injection_status: "applied",
              message: {
                parts: [{ part_kind: "text", content: "change direction" }],
              },
              source: "user",
            },
          ],
          run_id: "run-1",
          run_status: "completed",
          run_user_message: "Tool-heavy task",
        },
      ],
      next_cursor: null,
    });

    const { container } = renderTimeline();

    expect(await screen.findByText("Injection applied: change direction · source user"))
      .toBeVisible();
    expect(await screen.findByText("Processed")).toBeVisible();
    expect(screen.getByText("Run failed: shell")).not.toBeVisible();
    expect(screen.queryByText("Running: shell")).not.toBeInTheDocument();
    expect(screen.queryByText("Reading: read_file")).not.toBeInTheDocument();
    expect(screen.getByText("Read: read_file")).not.toBeVisible();
    openProcessedGroup(container);
    expect(screen.getByText("Run failed: shell")).toBeVisible();
    expect(screen.getByText("Read: read_file")).toBeVisible();
    expect(toolPreviewTexts(container)).toEqual([
      "Shell command failed",
      "file content",
    ]);
    const rowTexts = Array.from(container.querySelectorAll("article.at-message"))
      .map((row) => row.textContent ?? "");
    expect(rowTexts).toHaveLength(3);
    expect(rowTexts[0]).toContain("Injection applied: change direction");
    expect(rowTexts[1]).toContain("Now let me read more files.");
    expect(rowTexts[2]).toContain("done");
    expect(toolPreElement(screenElement(screen.getByText("Run failed: shell"))))
      .toHaveTextContent(/ls missing/);
    expect(toolPreElement(screenElement(screen.getByText("Read: read_file"))))
      .toHaveTextContent(/plugin_cli.py/);
  });

  it("renders runtime tool approval requests and resolved decisions", async () => {
    useRuntimeStore.setState({
      runtimeState: {
        activeRunIds: [],
        runs: {
          "run-approval": {
            runId: "run-approval",
            status: "closed",
            lastEventId: 2,
            seenEventKeys: [],
            terminalEventType: null,
            entries: [
              {
                id: "run-approval:1:0",
                sessionId: "session-1",
                runId: "run-approval",
                roleId: "MainAgent",
                kind: "tool_approval_requested",
                text: "execute_command",
                payload: {
                  acp_options: [
                    { name: "Allow once", optionId: "allow_once" },
                    { name: "Deny", optionId: "deny" },
                  ],
                  args_preview: "npm test",
                  tool_call_id: "tool-approval-1",
                  action_family: "run",
                  semantic_category: "execution",
                  tool_name: "execute_command",
                },
                eventId: 1,
                occurredAt: "2026-06-23T00:00:00Z",
              },
              {
                id: "run-approval:2:1",
                sessionId: "session-1",
                runId: "run-approval",
                roleId: "MainAgent",
                kind: "tool_approval_resolved",
                text: "execute_command",
                payload: {
                  action: "deny",
                  feedback: "Unsafe command",
                  tool_call_id: "tool-approval-1",
                  action_family: "run",
                  semantic_category: "execution",
                  tool_name: "execute_command",
                },
                eventId: 2,
                occurredAt: "2026-06-23T00:00:01Z",
              },
            ],
          },
        },
      },
    });
    listSessionMessagesMock.mockResolvedValue([]);

    const { container } = renderTimeline();

    expect(await screen.findByText("Processed")).toBeVisible();
    const approvalRequest = await screen.findByText("Approval requested: execute_command");
    expect(approvalRequest).not.toBeVisible();
    const approvalDenied = screen.getByText("Approval denied: execute_command");
    expect(approvalDenied).not.toBeVisible();
    openProcessedGroup(container);
    expect(approvalRequest).toBeVisible();
    expect(toolPreviewTexts(screenElement(approvalRequest))).toEqual([
      "Args: npm test",
    ]);
    const approvalRequestDetails = toolPreElement(screenElement(approvalRequest));
    expect(approvalRequestDetails).not.toBeVisible();
    expect(approvalRequestDetails).toHaveTextContent(/Args: npm test/);
    expect(approvalRequestDetails).toHaveTextContent(/Options: Allow once, Deny/);
    expect(approvalDenied).toBeVisible();
    expect(toolPreviewTexts(screenElement(approvalDenied))).toEqual([
      "Action: deny",
    ]);
    const approvalDeniedDetails = toolPreElement(screenElement(approvalDenied));
    expect(approvalDeniedDetails).not.toBeVisible();
    expect(approvalDeniedDetails).toHaveTextContent(/Action: deny/);
    expect(approvalDeniedDetails).toHaveTextContent(/Feedback: Unsafe command/);

    fireEvent.click(approvalRequest);

    expect(approvalRequestDetails).toBeVisible();

    fireEvent.click(approvalDenied);

    expect(approvalDeniedDetails).toBeVisible();
  });

  it("renders runtime output_delta text parts from payload output", async () => {
    setRuntimeEntries([
      runtimeOutputDeltaEntry({
        id: "run-output:1:0",
        payload: {
          output: [{ kind: "text", text: "Structured output text" }],
        },
      }),
    ]);
    listSessionMessagesMock.mockResolvedValue([]);

    renderTimeline();

    expect(await screen.findByText("Structured output text")).toBeVisible();
    expect(screen.queryByText("output delta")).not.toBeInTheDocument();
  });

  it("aggregates sequential runtime text deltas into one message row", async () => {
    setRuntimeEntries([
      runtimeTextDeltaEntry({
        eventId: 1,
        id: "run-output:1:0",
        text: "Hel",
      }),
      runtimeTextDeltaEntry({
        eventId: 2,
        id: "run-output:2:1",
        text: "lo",
      }),
    ]);
    listSessionMessagesMock.mockResolvedValue([]);

    const { container } = renderTimeline();

    expect(await screen.findByText("Hello")).toBeVisible();
    expect(container.querySelectorAll("article.at-message")).toHaveLength(1);
    expect(screen.queryByText("Hel")).not.toBeInTheDocument();
    expect(screen.queryByText("lo")).not.toBeInTheDocument();
  });

  it("shows a terminal cursor and disables copy while runtime text is streaming", async () => {
    setRuntimeEntries([
      runtimeTextDeltaEntry({
        eventId: 1,
        id: "run-output:1:0",
        text: "Streaming answer",
      }),
    ], "open");
    listSessionMessagesMock.mockResolvedValue([]);

    const { container } = renderTimeline();

    expect(await screen.findByText("Streaming answer")).toBeVisible();
    const messageRow = container.querySelector("article.at-message");
    expect(messageRow).toHaveClass("is-streaming");
    expect(container.querySelectorAll(".streaming-cursor")).toHaveLength(1);
    const copyButton = await screen.findByRole("button", {
      name: "Copy last answer",
    });
    expect(copyButton).toBeDisabled();
  });

  it("renders the current streaming delta without frontend replay after remount", async () => {
    const streamingText =
      "HYDRATED_STREAM_ALPHA HYDRATED_STREAM_BETA HYDRATED_STREAM_GAMMA";
    setRuntimeEntries([
      runtimeTextDeltaEntry({
        eventId: 1,
        id: "run-output:1:0",
        text: streamingText,
      }),
    ], "open");
    listSessionMessagesMock.mockResolvedValue([]);

    const firstRender = renderTimeline();

    expect(firstRender.container.querySelector(".at-message-streaming-text"))
      .not.toBeNull();
    expect(screen.getByText(streamingText)).toBeVisible();
    firstRender.unmount();

    const secondRender = renderTimeline();

    expect(secondRender.container.querySelector(".at-message-streaming-text"))
      .not.toBeNull();
    const streamingBlock = secondRender.container.querySelector(
      ".at-message-streaming-text",
    );
    if (streamingBlock === null) {
      throw new Error("Expected a streaming text block after remount.");
    }
    expect(streamingBlock).toHaveTextContent(streamingText);
    expect(streamingBlock.textContent).not.toBe(streamingText.slice(0, 2));
    expect(secondRender.container.querySelectorAll(".streaming-cursor"))
      .toHaveLength(1);
  });

  it("turns off the runtime text cursor when a subagent stream is finalized", async () => {
    setRuntimeEntries([
      {
        eventId: 1,
        id: "subagent_run_1:1:0",
        instanceId: "inst-sub-1",
        kind: "text_delta",
        occurredAt: "2026-06-23T00:00:00Z",
        payload: { text: "stale overlay" },
        roleId: "Crafter",
        runId: "subagent_run_1",
        sessionId: "session-1",
        text: "stale overlay",
      },
    ]);
    listSessionMessagesMock.mockResolvedValue([]);

    const { container } = renderTimeline("session-1", {
      runtimeRunId: "subagent_run_1",
    });

    expect(await screen.findByText("stale overlay")).toBeVisible();
    const messageRow = screen
      .getByText("stale overlay")
      .closest("article.at-message");
    expect(messageRow).not.toBeNull();
    expect(messageRow).not.toHaveClass("is-streaming");
    expect(messageRow?.querySelector(".at-message-streaming-text")).toBeNull();
    expect(messageRow?.querySelector(".streaming-cursor")).toBeNull();
    expect(container.querySelectorAll(".streaming-cursor")).toHaveLength(0);
    expect(container.querySelectorAll("article.at-message")).toHaveLength(1);
  });

  it("clears the runtime text streaming cursor when a tool call arrives", async () => {
    setRuntimeEntries([
      runtimeTextDeltaEntry({
        eventId: 1,
        id: "run-output:1:0",
        text: "Streaming before the tool",
      }),
      runtimeToolCallEntry({
        eventId: 2,
        id: "run-output:2:1",
      }),
    ], "open");
    listSessionMessagesMock.mockResolvedValue([]);

    const { container } = renderTimeline();

    expect(await screen.findByText("Streaming before the tool")).toBeVisible();
    expect(screen.getByText("Running: execute_command")).toBeVisible();
    const textRow = screen
      .getByText("Streaming before the tool")
      .closest("article.at-message");
    expect(textRow).not.toBeNull();
    expect(textRow).not.toHaveClass("is-streaming");
    expect(textRow?.querySelector(".at-message-streaming-text")).toBeNull();
    expect(textRow?.querySelector(".streaming-cursor")).toBeNull();
    expect(container.querySelectorAll(".streaming-cursor")).toHaveLength(0);
    expect(container.querySelectorAll("article.at-message")).toHaveLength(2);
  });

  it("keeps real text tail when a closed stream finalizes after an idle boundary", async () => {
    setRuntimeEntries([
      runtimeTextDeltaEntry({
        eventId: 1,
        id: "run-output:1:0",
        text: "hello",
      }),
      runtimeToolResultEntry({
        eventId: 2,
        id: "run-output:2:1",
      }),
    ]);
    listSessionMessagesMock.mockResolvedValue([]);

    const { container } = renderTimeline();

    expect(await screen.findByText("hello")).toBeVisible();
    expect(await screen.findByText("Processed")).toBeVisible();
    expect(screen.getByText("Ran: execute_command")).not.toBeVisible();
    const textRow = screen.getByText("hello").closest("article.at-message");
    expect(textRow).not.toBeNull();
    expect(textRow).not.toHaveClass("is-streaming");
    expect(textRow?.querySelector(".streaming-cursor")).toBeNull();
    expect(container.querySelectorAll(".streaming-cursor")).toHaveLength(0);
    expect(container.querySelectorAll("article.at-message")).toHaveLength(1);
    openProcessedGroup(container);
    expect(screen.getByText("Ran: execute_command")).toBeVisible();
  });

  it("renders long open runtime text streams through the stable markdown container", async () => {
    const prefix = "x".repeat(10000);
    const suffix = "y".repeat(3000);
    setRuntimeEntries([
      runtimeTextDeltaEntry({
        eventId: 1,
        id: "run-output:1:0",
        text: prefix,
      }),
      runtimeTextDeltaEntry({
        eventId: 2,
        id: "run-output:2:1",
        text: suffix,
      }),
    ], "open");
    listSessionMessagesMock.mockResolvedValue([]);

    const { container } = renderTimeline();

    await waitFor(() =>
      expect(container.querySelector(".at-message-streaming-text")).not.toBeNull(),
    );
    const streamingText = container.querySelector<HTMLElement>(
      ".at-message-streaming-text",
    );
    expect(streamingText?.textContent).toHaveLength(13000);
    expect(streamingText?.textContent).toBe(`${prefix}${suffix}`);
    expect(container.querySelectorAll(".streaming-cursor")).toHaveLength(1);
    expect(container.querySelector(".at-message-markdown")).not.toBeNull();
    expect(container.querySelector(".at-message-plain-stream")).toBeNull();
    expect(container.querySelectorAll("article.at-message")).toHaveLength(1);
  });

  it("finalizes long runtime text streams back through markdown rendering", async () => {
    setRuntimeEntries([
      runtimeTextDeltaEntry({
        eventId: 1,
        id: "run-output:1:0",
        text: `# Final stream\n\n${"x".repeat(13000)}`,
      }),
      {
        eventId: 2,
        id: "run-output:2:1",
        kind: "run_completed",
        occurredAt: "2026-06-23T00:00:02Z",
        payload: { status: "completed" },
        roleId: "MainAgent",
        runId: "run-output",
        sessionId: "session-1",
        text: "run.completed",
      },
    ]);
    listSessionMessagesMock.mockResolvedValue([]);

    const { container } = renderTimeline();

    expect(
      await screen.findByRole("heading", { level: 1, name: "Final stream" }),
    ).toBeVisible();
    expect(container.querySelector(".at-message-plain-stream")).toBeNull();
    expect(container.querySelector(".at-message-markdown")).not.toBeNull();
    expect(container.querySelector(".streaming-cursor")).toBeNull();
  });

  it("does not merge text deltas from distinct runtime instances", async () => {
    setRuntimeEntries([
      runtimeTextDeltaEntry({
        eventId: 1,
        id: "run-output:1:0",
        instanceId: "worker-a",
        text: "A1",
      }),
      runtimeTextDeltaEntry({
        eventId: 2,
        id: "run-output:2:1",
        instanceId: "worker-b",
        text: "B1",
      }),
      runtimeTextDeltaEntry({
        eventId: 3,
        id: "run-output:3:2",
        instanceId: "worker-a",
        text: "A2",
      }),
    ]);
    listSessionMessagesMock.mockResolvedValue([]);

    const { container } = renderTimeline();

    expect(await screen.findByText("A1A2")).toBeVisible();
    expect(screen.getByText("B1")).toBeVisible();
    expect(container.querySelectorAll("article.at-message")).toHaveLength(2);
  });

  it("joins output_delta text parts onto the current runtime text segment", async () => {
    setRuntimeEntries([
      runtimeTextDeltaEntry({
        eventId: 1,
        id: "run-output:1:0",
        text: "Hello",
      }),
      runtimeOutputDeltaEntry({
        eventId: 2,
        id: "run-output:2:1",
        payload: {
          output: [{ kind: "text", text: " world" }],
        },
      }),
      runtimeTextDeltaEntry({
        eventId: 3,
        id: "run-output:3:2",
        text: "!",
      }),
    ]);
    listSessionMessagesMock.mockResolvedValue([]);

    const { container } = renderTimeline();

    expect(await screen.findByText("Hello world!")).toBeVisible();
    expect(container.querySelectorAll("article.at-message")).toHaveLength(1);
    expect(screen.queryByText("output delta")).not.toBeInTheDocument();
  });

  it("joins top-level output_delta text onto one streaming runtime segment", async () => {
    setRuntimeEntries([
      runtimeOutputDeltaEntry({
        eventId: 1,
        id: "run-output:1:0",
        payload: { text: "SUBCLEAN_1\n" },
      }),
      runtimeOutputDeltaEntry({
        eventId: 2,
        id: "run-output:2:1",
        payload: { delta: "SUBCLEAN_2\n" },
      }),
    ], "open");
    listSessionMessagesMock.mockResolvedValue([]);

    const { container } = renderTimeline();

    await waitFor(() => {
      expect(container).toHaveTextContent("SUBCLEAN_1");
      expect(container).toHaveTextContent("SUBCLEAN_2");
    });
    const rows = Array.from(container.querySelectorAll("article.at-message"));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveClass("is-streaming");
    expect(rows[0]?.textContent).toContain("SUBCLEAN_1");
    expect(rows[0]?.textContent).toContain("SUBCLEAN_2");
    expect(container.querySelectorAll(".streaming-cursor")).toHaveLength(1);
  });

  it("closes runtime text before rendering media_ref output parts", async () => {
    setRuntimeEntries([
      runtimeTextDeltaEntry({
        eventId: 1,
        id: "run-output:1:0",
        text: "before media",
      }),
      runtimeOutputDeltaEntry({
        eventId: 2,
        id: "run-output:2:1",
        payload: {
          output: [
            {
              kind: "media_ref",
              mime_type: "image/png",
              modality: "image",
              name: "runtime-media.png",
              url: "https://example.test/runtime-media.png",
            },
          ],
        },
      }),
      runtimeTextDeltaEntry({
        eventId: 3,
        id: "run-output:3:2",
        text: "after media",
      }),
    ]);
    listSessionMessagesMock.mockResolvedValue([]);

    const { container } = renderTimeline();

    expect(await screen.findByText("before media")).toBeVisible();
    expect(screen.getByText("after media")).toBeVisible();
    const image = screen.getByRole("img", { name: "runtime-media.png" });
    expect(image).toHaveAttribute("src", "https://example.test/runtime-media.png");
    expect(container.querySelectorAll("article.at-message")).toHaveLength(3);
  });

  it("splits runtime text around malformed text_delta fallback rows", async () => {
    setRuntimeEntries([
      runtimeTextDeltaEntry({
        eventId: 1,
        id: "run-output:1:0",
        text: "before malformed text",
      }),
      runtimeTextDeltaEntry({
        eventId: 2,
        id: "run-output:2:1",
        payload: { parse_error: true, raw_payload_json: "{bad json" },
        text: "malformed text fallback",
      }),
      runtimeTextDeltaEntry({
        eventId: 3,
        id: "run-output:3:2",
        text: "after malformed text",
      }),
    ]);
    listSessionMessagesMock.mockResolvedValue([]);

    const { container } = renderTimeline();

    expect(await screen.findByText("before malformed text")).toBeVisible();
    expect(screen.getByText("malformed text fallback")).toBeVisible();
    expect(screen.getByText("after malformed text")).toBeVisible();
    expect(container.querySelectorAll("article.at-message")).toHaveLength(3);
  });

  it("splits runtime text around malformed output_delta fallback rows", async () => {
    setRuntimeEntries([
      runtimeTextDeltaEntry({
        eventId: 1,
        id: "run-output:1:0",
        text: "before malformed output",
      }),
      runtimeOutputDeltaEntry({
        eventId: 2,
        id: "run-output:2:1",
        payload: { output: [{ kind: "unsupported", text: "ignored" }] },
        text: "malformed output fallback",
      }),
      runtimeTextDeltaEntry({
        eventId: 3,
        id: "run-output:3:2",
        text: "after malformed output",
      }),
    ]);
    listSessionMessagesMock.mockResolvedValue([]);

    const { container } = renderTimeline();

    expect(await screen.findByText("before malformed output")).toBeVisible();
    expect(screen.getByText("malformed output fallback")).toBeVisible();
    expect(screen.getByText("after malformed output")).toBeVisible();
    expect(container.querySelectorAll("article.at-message")).toHaveLength(3);
  });

  it("splits runtime text segments around tool events", async () => {
    setRuntimeEntries([
      runtimeTextDeltaEntry({
        eventId: 1,
        id: "run-output:1:0",
        text: "before tool",
      }),
      runtimeToolCallEntry({
        eventId: 2,
        id: "run-output:2:1",
      }),
      runtimeTextDeltaEntry({
        eventId: 3,
        id: "run-output:3:2",
        text: "after tool",
      }),
    ], "open");
    listSessionMessagesMock.mockResolvedValue([]);

    const { container } = renderTimeline();

    expect(await screen.findByText("before tool")).toBeVisible();
    expect(screen.getByText("Running: execute_command")).toBeVisible();
    expect(screen.getByText("after tool")).toBeVisible();
    expect(container.querySelectorAll("article.at-message")).toHaveLength(3);
  });

  it("splits runtime text segments around tool result events", async () => {
    setRuntimeEntries([
      runtimeTextDeltaEntry({
        eventId: 1,
        id: "run-output:1:0",
        text: "before tool lifecycle",
      }),
      runtimeToolCallEntry({
        eventId: 2,
        id: "run-output:2:1",
      }),
      runtimeTextDeltaEntry({
        eventId: 3,
        id: "run-output:3:2",
        text: "during tool lifecycle",
      }),
      runtimeToolResultEntry({
        eventId: 4,
        id: "run-output:4:3",
      }),
      runtimeTextDeltaEntry({
        eventId: 5,
        id: "run-output:5:4",
        text: "after tool lifecycle",
      }),
    ], "open");
    listSessionMessagesMock.mockResolvedValue([]);

    const { container } = renderTimeline();

    expect(await screen.findByText("before tool lifecycle")).toBeVisible();
    expect(await screen.findByText("during tool lifecycle")).toBeVisible();
    expect(await screen.findByText("after tool lifecycle")).toBeVisible();
    expect(screen.queryByText("Running: execute_command")).not.toBeInTheDocument();
    expect(screen.getByText("Ran: execute_command")).toBeVisible();
    const rowTexts = Array.from(container.querySelectorAll("article.at-message"))
      .map((row) => row.textContent ?? "");
    expect(rowTexts).toHaveLength(4);
    expect(rowTexts[0]).toContain("before tool lifecycle");
    expect(rowTexts[1]).toContain("Ran: execute_command");
    expect(rowTexts[2]).toContain("during tool lifecycle");
    expect(rowTexts[3]).toContain("after tool lifecycle");
    expect(toolPreElement(screenElement(screen.getByText("Ran: execute_command"))))
      .toHaveTextContent(/npm test/);
  });

  it("keeps cursorless runtime text segments unique around tool events", async () => {
    setRuntimeStateFromEvents([
      relayRunEvent({
        event_id: null,
        event_type: "text_delta",
        occurred_at: undefined,
        payload_json: JSON.stringify({ text: "first cursorless chunk" }),
      }),
      relayRunEvent({
        event_id: null,
        event_type: "tool_call",
        occurred_at: undefined,
        payload_json: JSON.stringify({
          args: { command: "pwd" },
          tool_call_id: "call-cursorless",
          action_family: "run",
          semantic_category: "execution",
          tool_name: "shell",
        }),
      }),
      relayRunEvent({
        event_id: null,
        event_type: "text_delta",
        occurred_at: undefined,
        payload_json: JSON.stringify({ text: "second cursorless chunk" }),
      }),
    ]);
    listSessionMessagesMock.mockResolvedValue([]);

    const { container } = renderTimeline();

    expect(await screen.findByText("first cursorless chunk")).toBeVisible();
    expect(screen.getByText("Running: shell")).toBeVisible();
    expect(screen.getByText("second cursorless chunk")).toBeVisible();
    expect(toolPreviewTexts(container)).toEqual(["pwd"]);
    const rowTexts = Array.from(container.querySelectorAll("article.at-message"))
      .map((row) => row.textContent ?? "");
    expect(rowTexts).toHaveLength(3);
    expect(rowTexts[0]).toContain("first cursorless chunk");
    expect(rowTexts[1]).toContain("Running: shell");
    expect(rowTexts[2]).toContain("second cursorless chunk");
  });

  it("renders runtime injections in event order without exposing raw events", async () => {
    setRuntimeEntries([
      runtimeToolCallEntry({
        eventId: 1,
        id: "run-output:1:0",
      }),
      runtimeGenericEntry({
        eventId: 2,
        id: "run-output:2:1",
        kind: "injection_applied",
        payload: {
          content: "Use OpenAI instead",
          injection_id: "inj-1",
          source: "user",
          status: "applied",
        },
        text: "injection applied",
      }),
      runtimeTextDeltaEntry({
        eventId: 3,
        id: "run-output:3:2",
        text: "Switching the search target to OpenAI.",
      }),
    ], "open");
    listSessionMessagesMock.mockResolvedValue([]);

    const { container } = renderTimeline();

    expect(await screen.findByText("Running: execute_command")).toBeVisible();
    expect(screen.getByText(/Injection applied: Use OpenAI instead/)).toBeVisible();
    expect(screen.queryByText("injection applied")).not.toBeInTheDocument();
    expect(await screen.findByText("Switching the search target to OpenAI."))
      .toBeVisible();
    const rowTexts = Array.from(container.querySelectorAll("article.at-message"))
      .map((row) => row.textContent ?? "");
    expect(rowTexts).toHaveLength(3);
    expect(rowTexts[0]).toContain("Running: execute_command");
    expect(rowTexts[1]).toContain("Injection applied: Use OpenAI instead");
    expect(rowTexts[2]).toContain("Switching the search target to OpenAI.");
  });

  it("upgrades an enqueued injection in place before later tool and terminal events", async () => {
    const textEntry = runtimeTextDeltaEntry({
      eventId: 10,
      id: "run-output:10:0",
      text: "Draft before inserted guidance",
    });
    const enqueuedEntry = runtimeGenericEntry({
      eventId: 11,
      id: "run-output:11:1",
      kind: "injection_enqueued",
      payload: {
        client_message_id: "client-insert-1",
        content: "Use the verified source",
        recipient_instance_id: "root-instance",
        source: "user",
        status: "queued",
        visibility: "public",
      },
      text: "injection enqueued",
    });
    setRuntimeEntries([textEntry, enqueuedEntry], "open");
    listSessionMessagesMock.mockResolvedValue([]);

    const { container } = renderTimeline();

    expect(await screen.findByText(/Injection queued: Use the verified source/))
      .toBeVisible();
    const pendingRow = container.querySelector<HTMLElement>(
      '[data-client-message-id="client-insert-1"]',
    );
    expect(pendingRow).toHaveAttribute("data-injection-status", "queued");

    act(() => {
      setRuntimeEntries([
        textEntry,
        enqueuedEntry,
        runtimeGenericEntry({
          eventId: 12,
          id: "run-output:12:2",
          kind: "injection_applied",
          payload: {
            client_message_id: "client-insert-1",
            content: "Use the verified source",
            injection_id: "inj-sequence",
            recipient_instance_id: "root-instance",
            source: "user",
            status: "applied",
            visibility: "public",
          },
          text: "injection applied",
        }),
        runtimeToolCallEntry({
          eventId: 13,
          id: "run-output:13:3",
        }),
        runtimeGenericEntry({
          eventId: 14,
          id: "run-output:14:4",
          kind: "run_completed",
          payload: { status: "completed" },
          text: "run completed",
        }),
      ], "closed");
    });

    expect(await screen.findByText(/Injection applied: Use the verified source/))
      .toBeVisible();
    const appliedRow = container.querySelector<HTMLElement>(
      '[data-injection-id="inj-sequence"]',
    );
    expect(appliedRow).toBe(pendingRow);
    expect(appliedRow).toHaveAttribute("data-injection-status", "applied");
    expect(container.querySelectorAll('[data-injection-id="inj-sequence"]'))
      .toHaveLength(1);
    const rowTexts = Array.from(
      container.querySelectorAll(".at-timeline-virtual > .at-timeline-row"),
    )
      .map((row) => row.textContent ?? "");
    expect(rowTexts).toHaveLength(3);
    expect(rowTexts[0]).toContain("Draft before inserted guidance");
    expect(rowTexts[1]).toContain("Injection applied: Use the verified source");
    expect(rowTexts[2]).toContain("Ran: execute_command");
  });

  it("hydrates and finally replays an injection by identity without moving or duplicating it", async () => {
    const roundsDeferred = deferredSessionRounds();
    listSessionRoundsMock.mockReturnValue(roundsDeferred.promise);
    listSessionMessagesMock.mockResolvedValue([]);
    setRuntimeEntries([
      runtimeGenericEntry({
        eventId: 11,
        id: "run-output:11:0",
        kind: "injection_enqueued",
        payload: {
          client_message_id: "client-hydrate",
          content: "Hydrate this inserted message",
          recipient_instance_id: "root-instance",
          source: "user",
          status: "queued",
          visibility: "public",
        },
        text: "injection enqueued",
      }),
    ], "open");

    const { container } = renderTimeline();

    await screen.findByText(/Injection queued: Hydrate this inserted message/);
    const optimisticRow = container.querySelector<HTMLElement>(
      '[data-client-message-id="client-hydrate"]',
    );
    expect(optimisticRow).not.toBeNull();

    await act(async () => {
      roundsDeferred.resolve({
        has_more: false,
        items: [{
          injection_messages: [{
            client_message_id: "client-hydrate",
            content: "Hydrate this inserted message",
            entry_type: "injection",
            injection_id: "inj-hydrate",
            injection_status: "applied",
            message_id: "persisted-inj-hydrate",
            queued_at: "2026-06-23T00:00:11Z",
            recipient_instance_id: "root-instance",
            source: "user",
            visibility: "public",
          }],
          run_id: "run-output",
          run_status: "completed",
        }],
        next_cursor: null,
      });
      await roundsDeferred.promise;
    });

    expect(await screen.findByText(/Injection applied: Hydrate this inserted message/))
      .toBeVisible();
    const hydratedRow = container.querySelector<HTMLElement>(
      '[data-injection-id="inj-hydrate"]',
    );
    expect(hydratedRow).toBe(optimisticRow);
    expect(container.querySelectorAll('[data-injection-id="inj-hydrate"]'))
      .toHaveLength(1);

    act(() => {
      useRuntimeStore.setState({ runtimeState: initialRuntimeState });
    });

    expect(await screen.findByText(/Injection applied: Hydrate this inserted message/))
      .toBeVisible();
    expect(container.querySelector('[data-injection-id="inj-hydrate"]'))
      .toBe(hydratedRow);
    expect(container.querySelectorAll('[data-injection-id="inj-hydrate"]'))
      .toHaveLength(1);
  });

  it("isolates public injections by session and root or subagent timeline scope", async () => {
    setRuntimeStateFromEvents([
      relayRunEvent({
        event_id: 11,
        event_type: "injection_enqueued",
        instance_id: "root-instance",
        payload_json: JSON.stringify({
          content: "Root inserted message",
          injection_id: "inj-root",
          recipient_instance_id: "root-instance",
          source: "user",
          visibility: "public",
        }),
        role_id: "MainAgent",
        run_id: "root-run",
        trace_id: "root-run",
      }),
      relayRunEvent({
        event_id: 11,
        event_type: "injection_enqueued",
        instance_id: "subagent-instance",
        payload_json: JSON.stringify({
          content: "Subagent inserted message",
          injection_id: "inj-subagent",
          recipient_instance_id: "subagent-instance",
          source: "user",
          visibility: "public",
        }),
        role_id: "Explorer",
        run_id: "subagent-run-1",
        trace_id: "subagent-run-1",
      }),
    ]);
    markRuntimeRunAsSubagent("subagent-run-1", "Explorer");
    listSessionMessagesMock.mockResolvedValue([]);

    const rootTimeline = renderTimeline("session-1", { primaryRoleId: "MainAgent" });

    expect(await screen.findByText(/Injection queued: Root inserted message/))
      .toBeVisible();
    expect(screen.queryByText(/Subagent inserted message/)).not.toBeInTheDocument();
    expect(rootTimeline.container.querySelector('[data-injection-id="inj-root"]'))
      .not.toBeNull();
    cleanup();

    const subagentTimeline = renderTimeline("session-1", {
      runtimeRunId: "subagent-run-1",
      variant: "subagent-panel",
    });

    expect(await screen.findByText(/Injection queued: Subagent inserted message/))
      .toBeVisible();
    expect(screen.queryByText(/Root inserted message/)).not.toBeInTheDocument();
    expect(
      subagentTimeline.container.querySelector('[data-injection-id="inj-subagent"]'),
    ).not.toBeNull();
    cleanup();

    renderTimeline("session-2", { primaryRoleId: "MainAgent" });
    expect(await screen.findByText("No messages yet")).toBeVisible();
    expect(screen.queryByText(/inserted message/)).not.toBeInTheDocument();
  });

  it("hides internal injections and replaces superseded pending identities", async () => {
    setRuntimeStateFromEvents([
      relayRunEvent({
        event_id: 11,
        event_type: "injection_enqueued",
        payload_json: JSON.stringify({
          client_message_id: "client-old",
          content: "Old pending insertion",
          injection_id: "inj-old",
          source: "user",
          visibility: "public",
        }),
      }),
      relayRunEvent({
        event_id: 12,
        event_type: "injection_enqueued",
        payload_json: JSON.stringify({
          client_message_id: "client-new",
          content: "Replacement insertion",
          injection_id: "inj-new",
          source: "user",
          superseded_client_message_ids: ["client-old"],
          superseded_injection_ids: ["inj-old"],
          visibility: "public",
        }),
      }),
      relayRunEvent({
        event_id: 13,
        event_type: "injection_enqueued",
        payload_json: JSON.stringify({
          content: "Internal reminder",
          injection_id: "inj-internal",
          source: "system",
          visibility: "internal",
        }),
      }),
      relayRunEvent({
        event_id: 14,
        event_type: "injection_enqueued",
        payload_json: JSON.stringify({
          content: "Failed insertion",
          injection_id: "inj-failed",
          source: "user",
          status: "failed",
          visibility: "public",
        }),
      }),
    ]);
    listSessionMessagesMock.mockResolvedValue([]);

    const { container } = renderTimeline();

    expect(await screen.findByText(/Injection queued: Replacement insertion/))
      .toBeVisible();
    expect(screen.queryByText(/Old pending insertion/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Internal reminder/)).not.toBeInTheDocument();
    expect(screen.getByText(/Injection failed: Failed insertion/)).toBeVisible();
    expect(container.querySelector('[data-injection-id="inj-old"]')).toBeNull();
    expect(container.querySelectorAll('[data-injection-id="inj-new"]'))
      .toHaveLength(1);
  });

  it("applies persisted supersession and visibility rules during final replay", async () => {
    listSessionMessagesMock.mockResolvedValue([]);
    listSessionRoundsMock.mockResolvedValue({
      has_more: false,
      items: [{
        injection_messages: [
          {
            client_message_id: "client-persisted-old",
            content: "Persisted old pending insertion",
            entry_type: "injection",
            injection_id: "inj-persisted-old",
            injection_status: "queued",
            queued_at: "2026-06-23T00:00:11Z",
            source: "user",
            visibility: "public",
          },
          {
            client_message_id: "client-persisted-new",
            content: "Persisted replacement insertion",
            entry_type: "injection",
            injection_id: "inj-persisted-new",
            injection_status: "applied",
            queued_at: "2026-06-23T00:00:12Z",
            source: "user",
            superseded_client_message_ids: ["client-persisted-old"],
            superseded_injection_ids: ["inj-persisted-old"],
            visibility: "public",
          },
          {
            content: "Persisted internal reminder",
            entry_type: "injection",
            injection_id: "inj-persisted-internal",
            injection_status: "applied",
            queued_at: "2026-06-23T00:00:13Z",
            source: "system",
            visibility: "internal",
          },
        ],
        run_id: "run-output",
        run_status: "completed",
      }],
      next_cursor: null,
    });

    const { container } = renderTimeline();

    expect(await screen.findByText(/Injection applied: Persisted replacement insertion/))
      .toBeVisible();
    expect(screen.queryByText(/Persisted old pending insertion/))
      .not.toBeInTheDocument();
    expect(screen.queryByText(/Persisted internal reminder/)).not.toBeInTheDocument();
    expect(container.querySelector('[data-injection-id="inj-persisted-old"]'))
      .toBeNull();
    expect(
      container.querySelectorAll('[data-injection-id="inj-persisted-new"]'),
    ).toHaveLength(1);
  });

  it("keeps replay-deduped injection events visible once between runtime text rows", async () => {
    const injectionEvent = relayRunEvent({
      event_id: 2,
      event_type: "injection_applied",
      payload_json: JSON.stringify({
        content: "Refine the answer",
        injection_id: "inj-replay",
        source: "user",
        status: "applied",
      }),
    });
    setRuntimeStateFromEvents([
      relayRunEvent({
        event_id: 1,
        event_type: "text_delta",
        payload_json: JSON.stringify({ text: "draft answer" }),
      }),
      injectionEvent,
      injectionEvent,
      relayRunEvent({
        event_id: 3,
        event_type: "text_delta",
        payload_json: JSON.stringify({ text: "refined answer" }),
      }),
    ]);
    listSessionMessagesMock.mockResolvedValue([]);

    const { container } = renderTimeline();

    expect(await screen.findByText("draft answer")).toBeVisible();
    expect(await screen.findByText("refined answer")).toBeVisible();
    expect(screen.getByText(/Injection applied: Refine the answer/)).toBeVisible();
    const rowTexts = Array.from(container.querySelectorAll("article.at-message"))
      .map((row) => row.textContent ?? "");
    expect(rowTexts).toHaveLength(3);
    expect(rowTexts[0]).toContain("draft answer");
    expect(rowTexts[1]).toContain("Injection applied: Refine the answer");
    expect(rowTexts[2]).toContain("refined answer");
  });

  it("removes superseded pending runtime tool calls while keeping the injection visible", async () => {
    setRuntimeStateFromEvents([
      relayRunEvent({
        event_id: 1,
        event_type: "tool_call",
        payload_json: JSON.stringify({
          args: { command: "pwd" },
          tool_call_id: "call-old",
          action_family: "run",
          semantic_category: "execution",
          tool_name: "shell",
        }),
      }),
      relayRunEvent({
        event_id: 2,
        event_type: "injection_applied",
        payload_json: JSON.stringify({
          content: "Use ls instead",
          injection_id: "inj-1",
          source: "user",
          status: "applied",
          supersedes_pending_tool_calls: true,
        }),
      }),
      relayRunEvent({
        event_id: 3,
        event_type: "tool_call",
        payload_json: JSON.stringify({
          args: { command: "ls" },
          tool_call_id: "call-new",
          action_family: "run",
          semantic_category: "execution",
          tool_name: "shell",
        }),
      }),
      relayRunEvent({
        event_id: 4,
        event_type: "tool_result",
        payload_json: JSON.stringify({
          result: { ok: true, output: "done" },
          tool_call_id: "call-new",
          action_family: "run",
          semantic_category: "execution",
          tool_name: "shell",
        }),
      }),
    ]);
    listSessionMessagesMock.mockResolvedValue([]);

    const { container } = renderTimeline();

    await screen.findByText("Ran: shell");
    expect(screen.getByText(/Injection applied: Use ls instead/)).toBeVisible();
    expect(screen.queryByText("Running: shell")).not.toBeInTheDocument();
    expect(screen.getByText("Ran: shell")).toBeVisible();
    const previews = toolPreviewTexts(container);
    expect(previews).not.toContain("pwd");
    expect(previews).toContain("done");
    expect(screen.queryByText("pwd")).not.toBeInTheDocument();
    expect(toolPreElement(screenElement(screen.getByText("Ran: shell"))))
      .toHaveTextContent(/ls/);
    const rowTexts = Array.from(container.querySelectorAll("article.at-message"))
      .map((row) => row.textContent ?? "");
    const contentRowTexts = rowTexts.filter((text) => text.trim().length > 0);
    expect(contentRowTexts).toHaveLength(2);
    expect(contentRowTexts[0]).toContain("Injection applied: Use ls instead");
    expect(contentRowTexts[1]).toContain("Ran: shell");
    expect(container.querySelectorAll(".streaming-cursor")).toHaveLength(0);
  });

  it("merges cursorless reconnect injection events by client and server identity", async () => {
    const applied = relayRunEvent({
      event_id: null,
      event_type: "injection_applied",
      occurred_at: undefined,
      payload_json: JSON.stringify({
        client_message_id: "client-cursorless",
        content: "Cursorless inserted message",
        injection_id: "inj-cursorless",
        source: "user",
        status: "applied",
        visibility: "public",
      }),
    });
    setRuntimeStateFromEvents([
      relayRunEvent({
        event_id: null,
        event_type: "injection_enqueued",
        occurred_at: undefined,
        payload_json: JSON.stringify({
          client_message_id: "client-cursorless",
          content: "Cursorless inserted message",
          source: "user",
          status: "queued",
          visibility: "public",
        }),
      }),
      applied,
      applied,
      relayRunEvent({
        event_id: null,
        event_type: "text_delta",
        occurred_at: undefined,
        payload_json: JSON.stringify({ text: "Text after cursorless insertion" }),
      }),
    ]);
    listSessionMessagesMock.mockResolvedValue([]);

    const { container } = renderTimeline();

    expect(await screen.findByText(/Injection applied: Cursorless inserted message/))
      .toBeVisible();
    expect(screen.getByText("Text after cursorless insertion")).toBeVisible();
    expect(container.querySelectorAll('[data-injection-id="inj-cursorless"]'))
      .toHaveLength(1);
    const rowTexts = Array.from(container.querySelectorAll("article.at-message"))
      .map((row) => row.textContent ?? "");
    expect(rowTexts[0]).toContain("Injection applied: Cursorless inserted message");
    expect(rowTexts[1]).toContain("Text after cursorless insertion");
  });

  it("splits runtime text segments around approval and thinking events", async () => {
    setRuntimeEntries([
      runtimeTextDeltaEntry({
        eventId: 1,
        id: "run-output:1:0",
        text: "before approval",
      }),
      runtimeApprovalRequestEntry({
        eventId: 2,
        id: "run-output:2:1",
      }),
      runtimeTextDeltaEntry({
        eventId: 3,
        id: "run-output:3:2",
        text: "after approval",
      }),
      runtimeThinkingDeltaEntry({
        eventId: 4,
        id: "run-output:4:3",
        text: "thinking split",
      }),
      runtimeTextDeltaEntry({
        eventId: 5,
        id: "run-output:5:4",
        text: "after thinking",
      }),
    ], "open");
    listSessionMessagesMock.mockResolvedValue([]);

    const { container } = renderTimeline();

    expect(await screen.findByText("before approval")).toBeVisible();
    expect(screen.getByText("Approval requested: execute_command")).toBeVisible();
    expect(screen.getByText("after approval")).toBeVisible();
    expect(screen.getByText("thinking split")).toBeVisible();
    expect(screen.getByText("after thinking")).toBeVisible();
    expect(container.querySelectorAll("article.at-message")).toHaveLength(5);
  });

  it("renders runtime output_delta media_ref parts from payload output", async () => {
    setRuntimeEntries([
      runtimeOutputDeltaEntry({
        id: "run-output:1:0",
        payload: {
          output: [
            {
              kind: "media_ref",
              mime_type: "image/png",
              modality: "image",
              name: "runtime-image.png",
              url: "https://example.test/runtime-image.png",
            },
          ],
        },
      }),
    ]);
    listSessionMessagesMock.mockResolvedValue([]);

    renderTimeline();

    const image = await screen.findByRole("img", { name: "runtime-image.png" });
    expect(image).toHaveAttribute("src", "https://example.test/runtime-image.png");
    expect(screen.getByText("runtime-image.png")).toBeVisible();
    expect(screen.queryByText("output delta")).not.toBeInTheDocument();
  });

  it("renders distinct cursorless runtime media outputs from reconnect streams", async () => {
    setRuntimeStateFromEvents([
      relayRunEvent({
        event_id: null,
        event_type: "output_delta",
        occurred_at: undefined,
        payload_json: JSON.stringify({
          output: [
            {
              kind: "media_ref",
              mime_type: "image/png",
              modality: "image",
              name: "first.png",
              url: "https://example.test/first.png",
            },
          ],
        }),
      }),
      relayRunEvent({
        event_id: null,
        event_type: "output_delta",
        occurred_at: undefined,
        payload_json: JSON.stringify({
          output: [
            {
              kind: "media_ref",
              mime_type: "image/png",
              modality: "image",
              name: "second.png",
              url: "https://example.test/second.png",
            },
          ],
        }),
      }),
    ]);
    listSessionMessagesMock.mockResolvedValue([]);

    renderTimeline();

    const firstImage = await screen.findByRole("img", { name: "first.png" });
    const secondImage = await screen.findByRole("img", { name: "second.png" });
    expect(firstImage).toHaveAttribute("src", "https://example.test/first.png");
    expect(secondImage).toHaveAttribute("src", "https://example.test/second.png");
    expect(screen.getByText("first.png")).toBeVisible();
    expect(screen.getByText("second.png")).toBeVisible();
    expect(screen.queryByText("output delta")).not.toBeInTheDocument();
  });

  it("falls back to runtime text when output_delta has no renderable output parts", async () => {
    setRuntimeEntries([
      runtimeOutputDeltaEntry({
        id: "run-output:1:0",
        payload: {
          output: [
            null,
            "ignored plain string",
            { kind: "media_ref", name: "missing-url.png", url: "" },
            { kind: "unsupported", text: "unsupported output part" },
          ],
        },
        text: "fallback output text",
      }),
    ]);
    listSessionMessagesMock.mockResolvedValue([]);

    renderTimeline();

    expect(await screen.findByText("fallback output text")).toBeVisible();
    expect(screen.queryByText("unsupported output part")).not.toBeInTheDocument();
    expect(screen.queryByText("missing-url.png")).not.toBeInTheDocument();
  });

  it("preserves structured output_delta parts without showing literal output delta fallback", async () => {
    setRuntimeEntries([
      runtimeOutputDeltaEntry({
        id: "run-output:1:0",
        payload: {
          output: [
            { kind: "unsupported", text: "unsupported output part" },
            { kind: "text", content: "Content field output text" },
            { kind: "media_ref", name: "missing-url.png", url: "" },
          ],
        },
      }),
    ]);
    listSessionMessagesMock.mockResolvedValue([]);

    renderTimeline();

    expect(await screen.findByText("Content field output text")).toBeVisible();
    expect(screen.queryByText("output delta")).not.toBeInTheDocument();
    expect(screen.queryByText("unsupported output part")).not.toBeInTheDocument();
    expect(screen.queryByText("missing-url.png")).not.toBeInTheDocument();
  });

  it("keeps repeated runtime thinking cycles with the same part index separate", async () => {
    setRuntimeStateFromEvents([
      relayRunEvent({
        event_id: 1,
        event_type: "thinking_started",
        payload_json: JSON.stringify({ part_index: 0 }),
      }),
      relayRunEvent({
        event_id: 2,
        event_type: "thinking_delta",
        payload_json: JSON.stringify({ part_index: 0, text: "first thought" }),
      }),
      relayRunEvent({
        event_id: 3,
        event_type: "thinking_finished",
        payload_json: JSON.stringify({ part_index: 0 }),
      }),
      relayRunEvent({
        event_id: 4,
        event_type: "thinking_started",
        payload_json: JSON.stringify({ part_index: 0 }),
      }),
      relayRunEvent({
        event_id: 5,
        event_type: "thinking_delta",
        payload_json: JSON.stringify({ part_index: 0, text: "second thought" }),
      }),
      relayRunEvent({
        event_id: 6,
        event_type: "thinking_finished",
        payload_json: JSON.stringify({ part_index: 0 }),
      }),
    ]);
    listSessionMessagesMock.mockResolvedValue([]);

    const { container } = renderTimeline();

    const thinkingLabels = await screen.findAllByText("Thinking");
    expect(thinkingLabels).toHaveLength(2);
    for (const label of thinkingLabels) {
      expect(label).toBeVisible();
    }
    const thinkingBlocks = container.querySelectorAll<HTMLDetailsElement>(
      "details.at-message-thinking",
    );
    expect(thinkingBlocks).toHaveLength(2);
    expect(thinkingBlocks[0]).toHaveAttribute("data-part-index", "0");
    expect(thinkingBlocks[0]).not.toHaveAttribute("open");
    expect(thinkingBlocks[0]).toHaveTextContent("first thought");
    expect(thinkingBlocks[0]).not.toHaveTextContent("second thought");
    expect(thinkingBlocks[1]).toHaveAttribute("data-part-index", "0");
    expect(thinkingBlocks[1]).not.toHaveAttribute("open");
    expect(thinkingBlocks[1]).toHaveTextContent("second thought");
    expect(thinkingBlocks[1]).not.toHaveTextContent("first thought");

    const firstSummary = thinkingBlocks[0]?.querySelector("summary");
    const secondSummary = thinkingBlocks[1]?.querySelector("summary");
    if (
      firstSummary === null ||
      firstSummary === undefined ||
      secondSummary === null ||
      secondSummary === undefined
    ) {
      throw new Error("Expected both runtime thinking disclosure summaries.");
    }

    fireEvent.click(firstSummary);
    expect(thinkingBlocks[0]).toHaveAttribute("open");
    expect(thinkingBlocks[1]).not.toHaveAttribute("open");

    fireEvent.click(secondSummary);
    expect(thinkingBlocks[0]).toHaveAttribute("open");
    expect(thinkingBlocks[1]).toHaveAttribute("open");

    fireEvent.click(firstSummary);
    expect(thinkingBlocks[0]).not.toHaveAttribute("open");
    expect(thinkingBlocks[1]).toHaveAttribute("open");
  });

  it("lets users collapse live thinking disclosures independently", async () => {
    setRuntimeStateFromEvents([
      relayRunEvent({
        event_id: 1,
        event_type: "thinking_started",
        payload_json: JSON.stringify({ part_index: 0 }),
      }),
      relayRunEvent({
        event_id: 2,
        event_type: "thinking_delta",
        payload_json: JSON.stringify({ part_index: 0, text: "first live thought" }),
      }),
      relayRunEvent({
        event_id: 3,
        event_type: "thinking_finished",
        payload_json: JSON.stringify({ part_index: 0 }),
      }),
      relayRunEvent({
        event_id: 4,
        event_type: "thinking_started",
        payload_json: JSON.stringify({ part_index: 1 }),
      }),
      relayRunEvent({
        event_id: 5,
        event_type: "thinking_delta",
        payload_json: JSON.stringify({ part_index: 1, text: "second live thought" }),
      }),
    ]);
    listSessionMessagesMock.mockResolvedValue([]);

    const { container } = renderTimeline("session-1", {
      runtimeRunId: "run-output",
    });

    expect(await screen.findByText("second live thought")).toBeVisible();
    const thinkingBlocks = container.querySelectorAll<HTMLDetailsElement>(
      "details.at-message-thinking",
    );
    expect(thinkingBlocks).toHaveLength(2);
    expect(thinkingBlocks[0]).not.toHaveAttribute("open");
    expect(thinkingBlocks[1]).toHaveAttribute("open");

    const liveSummary = thinkingBlocks[1]?.querySelector("summary");
    if (liveSummary === null || liveSummary === undefined) {
      throw new Error("Expected the live thinking disclosure summary.");
    }
    fireEvent.click(liveSummary);

    expect(thinkingBlocks[0]).not.toHaveAttribute("open");
    expect(thinkingBlocks[1]).not.toHaveAttribute("open");
    expect(screen.getByText("second live thought")).not.toBeVisible();

    fireEvent.click(liveSummary);

    expect(thinkingBlocks[0]).not.toHaveAttribute("open");
    expect(thinkingBlocks[1]).toHaveAttribute("open");
    expect(screen.getByText("second live thought")).toBeVisible();
  });

  it("does not duplicate replayed runtime thinking and tool parts", async () => {
    const replayedEvents = [
      relayRunEvent({
        event_id: 1,
        event_type: "thinking_started",
        payload_json: JSON.stringify({ part_index: 0 }),
      }),
      relayRunEvent({
        event_id: 2,
        event_type: "thinking_delta",
        payload_json: JSON.stringify({ part_index: 0, text: "deduped plan" }),
      }),
      relayRunEvent({
        event_id: 3,
        event_type: "thinking_finished",
        payload_json: JSON.stringify({ part_index: 0 }),
      }),
      relayRunEvent({
        event_id: 4,
        event_type: "tool_call",
        payload_json: JSON.stringify({
          args: { command: "date" },
          tool_call_id: "call-deduped-shell",
          action_family: "run",
          semantic_category: "execution",
          tool_name: "shell",
        }),
      }),
      relayRunEvent({
        event_id: 5,
        event_type: "tool_result",
        payload_json: JSON.stringify({
          result: { ok: true, output: "done" },
          tool_call_id: "call-deduped-shell",
          action_family: "run",
          semantic_category: "execution",
          tool_name: "shell",
        }),
      }),
    ];
    setRuntimeStateFromEvents([...replayedEvents, ...replayedEvents]);
    listSessionMessagesMock.mockResolvedValue([]);

    const { container } = renderTimeline();

    const thinkingTitle = await screen.findByText("Thinking");
    expect(thinkingTitle).toBeVisible();
    const thinkingBlocks = container.querySelectorAll(".at-message-thinking");
    expect(thinkingBlocks).toHaveLength(1);
    expect(thinkingBlocks[0]).toHaveTextContent("deduped plan");
    expect(thinkingBlocks[0]).not.toHaveTextContent("deduped plandeduped plan");
    expect(screen.getAllByText("Ran: shell")).toHaveLength(1);
    expect(toolPreviewTexts(screenElement(screen.getByText("Ran: shell"))))
      .toContain("done");
    expect(toolPreElement(screenElement(screen.getByText("Ran: shell"))))
      .toHaveTextContent(/date/);
  });

  it("accumulates runtime thinking events into one collapsible markdown block", async () => {
    useRuntimeStore.setState({
      runtimeState: {
        activeRunIds: [],
        runs: {
          "run-thinking": {
            runId: "run-thinking",
            status: "closed",
            lastEventId: 4,
            seenEventKeys: [],
            terminalEventType: null,
            entries: [
              {
                id: "run-thinking:1:0",
                sessionId: "session-1",
                runId: "run-thinking",
                roleId: "MainAgent",
                kind: "thinking_started",
                text: "thinking started",
                payload: { part_index: "0" },
                eventId: 1,
                occurredAt: "2026-06-23T00:00:00Z",
              },
              {
                id: "run-thinking:2:1",
                sessionId: "session-1",
                runId: "run-thinking",
                roleId: "MainAgent",
                kind: "thinking_delta",
                text: "**Dra",
                payload: {
                  part_index: "0",
                  text: "**Dra",
                },
                eventId: 2,
                occurredAt: "2026-06-23T00:00:01Z",
              },
              {
                id: "run-thinking:3:2",
                sessionId: "session-1",
                runId: "run-thinking",
                roleId: "MainAgent",
                kind: "thinking_delta",
                text: "ft** [plan](https://example.test/plan)",
                payload: {
                  part_index: "0",
                  text: "ft** [plan](https://example.test/plan)",
                },
                eventId: 3,
                occurredAt: "2026-06-23T00:00:02Z",
              },
              {
                id: "run-thinking:4:3",
                sessionId: "session-1",
                runId: "run-thinking",
                roleId: "MainAgent",
                kind: "thinking_finished",
                text: "thinking finished",
                payload: { part_index: "0" },
                eventId: 4,
                occurredAt: "2026-06-23T00:00:03Z",
              },
            ],
          },
        },
      },
    });
    listSessionMessagesMock.mockResolvedValue([]);

    const { container } = renderTimeline();

    expect(await screen.findByText("Processed")).toBeVisible();
    const thinkingTitle = await screen.findByText("Thinking");
    expect(thinkingTitle).not.toBeVisible();
    openProcessedGroup(container);
    expect(thinkingTitle).toBeVisible();
    const thinkingBlocks = container.querySelectorAll(".at-message-thinking");
    expect(thinkingBlocks).toHaveLength(1);
    const thinkingBlock = thinkingBlocks[0];
    expect(thinkingBlock).toHaveAttribute("data-part-index", "0");
    expect(thinkingBlock).toHaveAttribute("data-streaming", "false");
    expect(thinkingBlock).not.toHaveAttribute("open");
    expect(thinkingBlock?.querySelector("strong")).toHaveTextContent("Draft");
    expect(thinkingBlock?.querySelector("a")).toHaveAttribute(
      "href",
      "https://example.test/plan",
    );
    expect(thinkingBlock).not.toHaveTextContent("Thinking started");
    expect(thinkingBlock).not.toHaveTextContent("Thinking finished");
    expect(screen.queryByText("thinking started")).not.toBeInTheDocument();
    expect(screen.queryByText("thinking delta")).not.toBeInTheDocument();
    expect(screen.queryByText("thinking finished")).not.toBeInTheDocument();
  });

  it("renders persisted thinking parts with the same collapsible block", async () => {
    listSessionMessagesMock.mockResolvedValue([
      {
        message: {
          parts: [
            {
              content: "Persisted **thought**",
              part_index: 2,
              part_kind: "thinking",
            },
            { part_kind: "text", content: "Final answer" },
          ],
        },
        message_id: "assistant-thinking",
        role_id: "MainAgent",
      },
      {
        message: {
          parts: [
            {
              content: "Current shape thought",
              kind: "thinking",
              part_index: "3",
            },
          ],
        },
        message_id: "assistant-current-thinking",
        role_id: "MainAgent",
      },
    ]);

    const { container } = renderTimeline();

    expect(await screen.findByText("Final answer")).toBeVisible();
    const thinkingBlocks = container.querySelectorAll(".at-message-thinking");
    expect(thinkingBlocks).toHaveLength(2);
    expect(thinkingBlocks[0]).toHaveAttribute("data-part-index", "2");
    expect(thinkingBlocks[0]).toHaveTextContent("Thinking");
    expect(thinkingBlocks[0]?.querySelector("strong")).toHaveTextContent("thought");
    expect(thinkingBlocks[1]).toHaveAttribute("data-part-index", "3");
    expect(thinkingBlocks[1]).toHaveTextContent("Current shape thought");
  });

  it("trims hydrated thinking prefixes from live overlay deltas", async () => {
    const prefix = "Persisted planning prefix.";
    const suffix = "Live suffix still streaming.";
    setRuntimeStateFromEvents([
      relayRunEvent({
        event_id: 1,
        event_type: "thinking_started",
        payload_json: JSON.stringify({ part_index: 0 }),
        run_id: "run-thinking-prefix",
        trace_id: "run-thinking-prefix",
      }),
      relayRunEvent({
        event_id: 2,
        event_type: "thinking_delta",
        payload_json: JSON.stringify({
          part_index: 0,
          text: `${prefix} ${suffix}`,
        }),
        run_id: "run-thinking-prefix",
        trace_id: "run-thinking-prefix",
      }),
    ]);
    listSessionMessagesMock.mockResolvedValue([
      {
        message: {
          parts: [
            {
              content: prefix,
              part_index: 0,
              part_kind: "thinking",
            },
          ],
        },
        message_id: "assistant-thinking-prefix",
        role_id: "MainAgent",
        run_id: "run-thinking-prefix",
      },
    ]);

    const { container } = renderTimeline("session-1", {
      runtimeRunId: "run-thinking-prefix",
    });

    await waitFor(() => {
      expect(textOccurrenceCount(container.textContent ?? "", prefix)).toBe(1);
      expect(textOccurrenceCount(container.textContent ?? "", suffix)).toBe(1);
    });
    const thinkingBlocks = container.querySelectorAll(".at-message-thinking");
    expect(thinkingBlocks).toHaveLength(1);
    expect(thinkingBlocks[0]).toHaveAttribute("data-streaming", "true");
  });

  it("keeps live thinking open when part index is missing", async () => {
    useRuntimeStore.setState({
      runtimeState: {
        activeRunIds: ["run-live-thinking"],
        runs: {
          "run-live-thinking": {
            runId: "run-live-thinking",
            status: "open",
            lastEventId: 2,
            seenEventKeys: [],
            terminalEventType: null,
            entries: [
              {
                id: "run-live-thinking:1:0",
                sessionId: "session-1",
                runId: "run-live-thinking",
                roleId: "MainAgent",
                kind: "thinking_started",
                text: "thinking started",
                payload: {},
                eventId: 1,
                occurredAt: "2026-06-23T00:00:00Z",
              },
              {
                id: "run-live-thinking:2:1",
                sessionId: "session-1",
                runId: "run-live-thinking",
                roleId: "MainAgent",
                kind: "thinking_delta",
                text: "live thought",
                payload: { text: "live thought" },
                eventId: 2,
                occurredAt: "2026-06-23T00:00:01Z",
              },
            ],
          },
        },
      },
    });
    listSessionMessagesMock.mockResolvedValue([]);

    const { container } = renderTimeline();

    expect(await screen.findByText("Live")).toBeVisible();
    const thinkingBlock = container.querySelector(".at-message-thinking");
    expect(thinkingBlock).toHaveAttribute("data-part-index", "0");
    expect(thinkingBlock).toHaveAttribute("data-streaming", "true");
    expect(thinkingBlock).toHaveAttribute("open");
    expect(screen.getByText("live thought")).toBeVisible();
  });

  it("restores an idle streaming cursor after thinking finishes in an open run", async () => {
    setRuntimeStateFromEvents([
      relayRunEvent({
        event_id: 1,
        event_type: "thinking_started",
        payload_json: JSON.stringify({ part_index: 0 }),
        run_id: "run-thinking-idle",
        trace_id: "run-thinking-idle",
      }),
      relayRunEvent({
        event_id: 2,
        event_type: "thinking_delta",
        payload_json: JSON.stringify({ part_index: 0, text: "working" }),
        run_id: "run-thinking-idle",
        trace_id: "run-thinking-idle",
      }),
      relayRunEvent({
        event_id: 3,
        event_type: "thinking_finished",
        payload_json: JSON.stringify({ part_index: 0 }),
        run_id: "run-thinking-idle",
        trace_id: "run-thinking-idle",
      }),
    ]);
    listSessionMessagesMock.mockResolvedValue([]);

    const { container } = renderTimeline("session-1", {
      runtimeRunId: "run-thinking-idle",
    });

    await screen.findByText("Thinking");
    const thinkingBlock = container.querySelector(".at-message-thinking");
    expect(thinkingBlock).toHaveAttribute("data-streaming", "false");
    expect(thinkingBlock).not.toHaveAttribute("open");
    expect(thinkingBlock).toHaveTextContent("working");
    expect(container.querySelectorAll(".streaming-cursor")).toHaveLength(1);
    expect(container.querySelectorAll(".at-message-streaming-text")).toHaveLength(1);
    expect(container.querySelectorAll("article.at-message")).toHaveLength(2);
    expect(screen.queryByText("Live")).not.toBeInTheDocument();
  });

  it("closes live thinking blocks on terminal run events", async () => {
    useRuntimeStore.setState({
      runtimeState: {
        activeRunIds: [],
        runs: {
          "run-failed-thinking": {
            runId: "run-failed-thinking",
            status: "closed",
            lastEventId: 3,
            seenEventKeys: [],
            terminalEventType: "run_failed",
            entries: [
              {
                id: "run-failed-thinking:1:0",
                sessionId: "session-1",
                runId: "run-failed-thinking",
                roleId: "MainAgent",
                kind: "thinking_started",
                text: "thinking started",
                payload: { part_index: 0 },
                eventId: 1,
                occurredAt: "2026-06-23T00:00:00Z",
              },
              {
                id: "run-failed-thinking:2:1",
                sessionId: "session-1",
                runId: "run-failed-thinking",
                roleId: "MainAgent",
                kind: "thinking_delta",
                text: "thought before failure",
                payload: { part_index: 0, text: "thought before failure" },
                eventId: 2,
                occurredAt: "2026-06-23T00:00:01Z",
              },
              {
                id: "run-failed-thinking:3:2",
                sessionId: "session-1",
                runId: "run-failed-thinking",
                roleId: "MainAgent",
                kind: "run_failed",
                text: "run failed",
                payload: { message: "run failed" },
                eventId: 3,
                occurredAt: "2026-06-23T00:00:02Z",
              },
            ],
          },
        },
      },
    });
    listSessionMessagesMock.mockResolvedValue([]);

    const { container } = renderTimeline();

    await screen.findByText("thought before failure");
    expect(screen.getByText("Run failed: run failed")).toBeVisible();
    const thinkingBlock = container.querySelector(".at-message-thinking");
    expect(thinkingBlock).toHaveTextContent("thought before failure");
    expect(thinkingBlock).toHaveAttribute("data-streaming", "false");
    expect(thinkingBlock).not.toHaveAttribute("open");
    expect(screen.queryByText("Live")).not.toBeInTheDocument();
  });

  it("keeps unpersisted runtime text and thinking visible after terminal events", async () => {
    setRuntimeStateFromEvents([
      relayRunEvent({
        event_id: 1,
        event_type: "thinking_started",
        payload_json: JSON.stringify({ part_index: 0 }),
      }),
      relayRunEvent({
        event_id: 2,
        event_type: "thinking_delta",
        payload_json: JSON.stringify({ part_index: 0, text: "planning" }),
      }),
      relayRunEvent({
        event_id: 3,
        event_type: "text_delta",
        payload_json: JSON.stringify({ text: "still not persisted" }),
      }),
      relayRunEvent({
        event_id: 4,
        event_type: "model_step_finished",
        payload_json: JSON.stringify({ status: "completed" }),
      }),
      relayRunEvent({
        event_id: 5,
        event_type: "run_completed",
        payload_json: JSON.stringify({ status: "completed" }),
      }),
    ]);
    listSessionMessagesMock.mockResolvedValue([]);

    const { container } = renderTimeline();

    expect(await screen.findByText("still not persisted")).toBeVisible();
    expect(screen.queryByText("Run completed: status completed")).not.toBeInTheDocument();
    expect(screen.queryByText("Model step finished: status completed")).not.toBeInTheDocument();
    const thinkingBlock = container.querySelector(".at-message-thinking");
    expect(thinkingBlock).toHaveTextContent("planning");
    expect(thinkingBlock).toHaveAttribute("data-streaming", "false");
    expect(thinkingBlock).not.toHaveAttribute("open");
    expect(screen.queryByText("Live")).not.toBeInTheDocument();
    expect(container.querySelector(".at-message-streaming-text")).toBeNull();
  });

  it.each([
    [
      "run_failed",
      {
        error: "Provider failed during TS stream.",
        root_task_id: "root-react",
        status: "failed",
      },
      "Run failed: status failed · Provider failed during TS stream. · root task root-react",
    ],
    [
      "run_stopped",
      {
        reason: "Stopped from TS stream.",
        root_task_id: "root-react",
        status: "stopped",
      },
      "Run stopped: status stopped · Stopped from TS stream. · root task root-react",
    ],
  ] as const)(
    "renders %s terminal lifecycle diagnostics",
    async (kind, payload, expectedText) => {
      setRuntimeEntries([
        runtimeTextDeltaEntry({
          eventId: 1,
          id: `${kind}:1:0`,
          text: `Output before ${kind}.`,
        }),
        {
          eventId: 2,
          id: `${kind}:2:1`,
          kind,
          occurredAt: "2026-06-23T00:00:01Z",
          payload,
          roleId: "MainAgent",
          runId: "run-output",
          sessionId: "session-1",
          text: kind.replaceAll("_", " "),
        },
      ]);
      listSessionMessagesMock.mockResolvedValue([]);

      renderTimeline();

      expect(await screen.findByText(`Output before ${kind}.`)).toBeVisible();
      expect(screen.getByText(expectedText)).toBeVisible();
      expect(screen.queryByText("Live")).not.toBeInTheDocument();
    },
  );

  it("drops empty thinking blocks when start is followed by finish", async () => {
    useRuntimeStore.setState({
      runtimeState: {
        activeRunIds: [],
        runs: {
          "run-empty-thinking": {
            runId: "run-empty-thinking",
            status: "closed",
            lastEventId: 2,
            seenEventKeys: [],
            terminalEventType: null,
            entries: [
              {
                id: "run-empty-thinking:1:0",
                sessionId: "session-1",
                runId: "run-empty-thinking",
                roleId: "MainAgent",
                kind: "thinking_started",
                text: "thinking started",
                payload: { part_index: 0 },
                eventId: 1,
                occurredAt: "2026-06-23T00:00:00Z",
              },
              {
                id: "run-empty-thinking:2:1",
                sessionId: "session-1",
                runId: "run-empty-thinking",
                roleId: "MainAgent",
                kind: "thinking_finished",
                text: "thinking finished",
                payload: { part_index: 0 },
                eventId: 2,
                occurredAt: "2026-06-23T00:00:01Z",
              },
            ],
          },
        },
      },
    });
    listSessionMessagesMock.mockResolvedValue([]);

    const { container } = renderTimeline();

    expect(await screen.findByText("No messages yet")).toBeVisible();
    expect(container.querySelector(".at-message-thinking")).toBeNull();
    expect(screen.queryByText("Thinking")).not.toBeInTheDocument();
  });

  it("drops empty thinking blocks when start is followed by a terminal event", async () => {
    useRuntimeStore.setState({
      runtimeState: {
        activeRunIds: [],
        runs: {
          "run-empty-terminal-thinking": {
            runId: "run-empty-terminal-thinking",
            status: "closed",
            lastEventId: 2,
            seenEventKeys: [],
            terminalEventType: "run_completed",
            entries: [
              {
                id: "run-empty-terminal-thinking:1:0",
                sessionId: "session-1",
                runId: "run-empty-terminal-thinking",
                roleId: "MainAgent",
                kind: "thinking_started",
                text: "thinking started",
                payload: { part_index: 0 },
                eventId: 1,
                occurredAt: "2026-06-23T00:00:00Z",
              },
              {
                id: "run-empty-terminal-thinking:2:1",
                sessionId: "session-1",
                runId: "run-empty-terminal-thinking",
                roleId: "MainAgent",
                kind: "run_completed",
                text: "run completed",
                payload: { message: "run completed" },
                eventId: 2,
                occurredAt: "2026-06-23T00:00:01Z",
              },
            ],
          },
        },
      },
    });
    listSessionMessagesMock.mockResolvedValue([]);

    const { container } = renderTimeline();

    expect(await screen.findByText("No messages yet")).toBeVisible();
    expect(screen.queryByText("Run completed: run completed")).not.toBeInTheDocument();
    expect(container.querySelector(".at-message-thinking")).toBeNull();
    expect(screen.queryByText("Thinking")).not.toBeInTheDocument();
  });

  it("drops whitespace-only thinking deltas before visible streamed text", async () => {
    useRuntimeStore.setState({
      runtimeState: {
        activeRunIds: ["run-blank-thinking-delta"],
        runs: {
          "run-blank-thinking-delta": {
            runId: "run-blank-thinking-delta",
            status: "open",
            lastEventId: 3,
            seenEventKeys: [],
            terminalEventType: null,
            entries: [
              {
                id: "run-blank-thinking-delta:1:0",
                sessionId: "session-1",
                runId: "run-blank-thinking-delta",
                roleId: "MainAgent",
                kind: "thinking_started",
                text: "thinking started",
                payload: { part_index: 0 },
                eventId: 1,
                occurredAt: "2026-06-23T00:00:00Z",
              },
              {
                id: "run-blank-thinking-delta:2:1",
                sessionId: "session-1",
                runId: "run-blank-thinking-delta",
                roleId: "MainAgent",
                kind: "thinking_delta",
                text: "\n  ",
                payload: { part_index: 0, text: "\n  " },
                eventId: 2,
                occurredAt: "2026-06-23T00:00:01Z",
              },
              {
                id: "run-blank-thinking-delta:3:2",
                sessionId: "session-1",
                runId: "run-blank-thinking-delta",
                roleId: "MainAgent",
                kind: "text_delta",
                text: "Visible streamed answer.",
                payload: { text: "Visible streamed answer." },
                eventId: 3,
                occurredAt: "2026-06-23T00:00:02Z",
              },
            ],
          },
        },
      },
    });
    listSessionMessagesMock.mockResolvedValue([]);

    const { container } = renderTimeline();

    expect(await screen.findByText("Visible streamed answer.")).toBeVisible();
    expect(container.querySelector(".at-message-thinking")).toBeNull();
    expect(screen.queryByText("Thinking")).not.toBeInTheDocument();
  });

  it("falls back to runtime text for malformed thinking payloads", async () => {
    useRuntimeStore.setState({
      runtimeState: {
        activeRunIds: [],
        runs: {
          "run-malformed-thinking": {
            runId: "run-malformed-thinking",
            status: "closed",
            lastEventId: 3,
            seenEventKeys: [],
            terminalEventType: null,
            entries: [
              {
                id: "run-malformed-thinking:1:0",
                sessionId: "session-1",
                runId: "run-malformed-thinking",
                roleId: "MainAgent",
                kind: "thinking_delta",
                text: "thinking payload fallback",
                payload: { parse_error: true, raw_payload_json: "{bad json" },
                eventId: 1,
                occurredAt: "2026-06-23T00:00:00Z",
              },
              {
                id: "run-malformed-thinking:2:1",
                sessionId: "session-1",
                runId: "run-malformed-thinking",
                roleId: "MainAgent",
                kind: "thinking_delta",
                text: "thinking delta missing text fallback",
                payload: { part_index: 0 },
                eventId: 2,
                occurredAt: "2026-06-23T00:00:01Z",
              },
              {
                id: "run-malformed-thinking:3:2",
                sessionId: "session-1",
                runId: "run-malformed-thinking",
                roleId: "MainAgent",
                kind: "thinking_delta",
                text: "thinking delta number fallback",
                payload: { part_index: 1, text: 123 },
                eventId: 3,
                occurredAt: "2026-06-23T00:00:02Z",
              },
              {
                id: "run-malformed-thinking:4:3",
                sessionId: "session-1",
                runId: "run-malformed-thinking",
                roleId: "MainAgent",
                kind: "text_delta",
                text: "Visible answer after noisy thinking deltas.",
                payload: { text: "Visible answer after noisy thinking deltas." },
                eventId: 4,
                occurredAt: "2026-06-23T00:00:03Z",
              },
            ],
          },
        },
      },
    });
    listSessionMessagesMock.mockResolvedValue([]);

    const { container } = renderTimeline();

    expect(await screen.findByText("thinking payload fallback")).toBeVisible();
    expect(
      await screen.findByText("Visible answer after noisy thinking deltas."),
    ).toBeVisible();
    expect(
      screen.queryByText("thinking delta missing text fallback"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("thinking delta number fallback")).not.toBeInTheDocument();
    expect(container.querySelector(".at-message-thinking")).toBeNull();
  });

  it("renders runtime tool calls, results, and validation failures", async () => {
    useRuntimeStore.setState({
      runtimeState: {
        activeRunIds: [],
        runs: {
          "run-tools": {
            runId: "run-tools",
            status: "closed",
            lastEventId: 4,
            seenEventKeys: [],
            terminalEventType: null,
            entries: [
              {
                id: "run-tools:1:0",
                sessionId: "session-1",
                runId: "run-tools",
                roleId: "MainAgent",
                kind: "tool_call",
                text: "execute_command",
                payload: {
                  args: { cmd: "npm test" },
                  tool_call_id: "tool-live-1",
                  action_family: "run",
                  semantic_category: "execution",
                  tool_name: "execute_command",
                },
                eventId: 1,
                occurredAt: "2026-06-23T00:00:00Z",
              },
              {
                id: "run-tools:2:1",
                sessionId: "session-1",
                runId: "run-tools",
                roleId: "MainAgent",
                kind: "tool_result",
                text: "execute_command",
                payload: {
                  error: true,
                  result: { error: "command failed", ok: false },
                  tool_call_id: "tool-live-1",
                  action_family: "run",
                  semantic_category: "execution",
                  tool_name: "execute_command",
                },
                eventId: 2,
                occurredAt: "2026-06-23T00:00:01Z",
              },
              {
                id: "run-tools:3:2",
                sessionId: "session-1",
                runId: "run-tools",
                roleId: "MainAgent",
                kind: "tool_input_validation_failed",
                text: "execute_command",
                payload: {
                  details: "cmd is required",
                  reason: "Input validation failed before tool execution.",
                  tool_call_id: "tool-live-2",
                  action_family: "run",
                  semantic_category: "execution",
                  tool_name: "execute_command",
                },
                eventId: 3,
                occurredAt: "2026-06-23T00:00:02Z",
              },
              {
                id: "run-tools:4:3",
                sessionId: "session-1",
                runId: "run-tools",
                roleId: "MainAgent",
                kind: "tool_result",
                text: "shell",
                payload: {
                  result: {
                    data: {
                      exit_code: 2,
                      output_excerpt: "missing",
                      status: "failed",
                    },
                    ok: true,
                  },
                  tool_call_id: "tool-live-3",
                  action_family: "run",
                  semantic_category: "execution",
                  tool_name: "shell",
                },
                eventId: 4,
                occurredAt: "2026-06-23T00:00:03Z",
              },
            ],
          },
        },
      },
    });
    listSessionMessagesMock.mockResolvedValue([]);

    const { container } = renderTimeline();

    expect(screen.queryByText("Running: execute_command")).not.toBeInTheDocument();
    expect(await screen.findByText("Processed")).toBeVisible();
    const commandError = await screen.findByText("Run failed: execute_command");
    expect(commandError).not.toBeVisible();
    expect(screen.getByText("Tool validation: execute_command")).not.toBeVisible();
    expect(screen.getByText("Run failed: shell")).not.toBeVisible();
    openProcessedGroup(container);
    expect(commandError).toBeVisible();
    expect(screen.getByText("Tool validation: execute_command")).toBeVisible();
    expect(screen.getByText("Run failed: shell")).toBeVisible();
    expect(toolPreviewTexts(screenElement(screen.getByText("Run failed: execute_command"))))
      .toContain("command failed");
    expect(toolPreviewTexts(screenElement(screen.getByText("Tool validation: execute_command"))))
      .toContain("Input validation failed before tool execution.");
    expect(toolPreviewTexts(screenElement(screen.getByText("Run failed: shell"))))
      .toContain("missing");
    const errorDetails = toolPreElement(
      screenElement(screen.getByText("Run failed: execute_command")),
    );
    expect(errorDetails).not.toBeVisible();
    expect(errorDetails).toHaveTextContent(/"cmd": "npm test"/);
    expect(screen.queryByText(/"ok": false/)).not.toBeInTheDocument();
    expect(screen.queryByText(/"error": "command failed"/)).not.toBeInTheDocument();
    expect(screenElement(screen.getByText("Run failed: execute_command")).closest(".at-message-tool"))
      .toHaveAttribute("data-status", "error");
    const validationDetails = toolPreElement(
      screenElement(screen.getByText("Tool validation: execute_command")),
    );
    expect(validationDetails).not.toBeVisible();
    expect(validationDetails).toHaveTextContent(/cmd is required/);
    expect(screenElement(screen.getByText("Tool validation: execute_command")).closest(".at-message-tool"))
      .toHaveAttribute("data-status", "validation_failed");

    fireEvent.click(screen.getByText("Tool validation: execute_command"));

    expect(validationDetails).toBeVisible();
    expect(validationDetails).toHaveTextContent(
      /Input validation failed before tool execution/,
    );
    expect(validationDetails).toHaveTextContent(/cmd is required/);
  });

  it("falls back to runtime text for malformed tool and approval payloads", async () => {
    useRuntimeStore.setState({
      runtimeState: {
        activeRunIds: [],
        runs: {
          "run-malformed-tools": {
            runId: "run-malformed-tools",
            status: "closed",
            lastEventId: 2,
            seenEventKeys: [],
            terminalEventType: null,
            entries: [
              {
                id: "run-malformed-tools:1:0",
                sessionId: "session-1",
                runId: "run-malformed-tools",
                roleId: "MainAgent",
                kind: "tool_call",
                text: "tool call",
                payload: { parse_error: true, raw_payload: "{bad json" },
                eventId: 1,
                occurredAt: "2026-06-23T00:00:00Z",
              },
              {
                id: "run-malformed-tools:2:1",
                sessionId: "session-1",
                runId: "run-malformed-tools",
                roleId: "MainAgent",
                kind: "tool_approval_requested",
                text: "tool approval requested",
                payload: {},
                eventId: 2,
                occurredAt: "2026-06-23T00:00:01Z",
              },
            ],
          },
        },
      },
    });
    listSessionMessagesMock.mockResolvedValue([]);

    renderTimeline();

    expect(await screen.findByText("tool call")).toBeVisible();
    expect(screen.getByText("tool approval requested")).toBeVisible();
    expect(screen.queryByText(/Tool call:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Approval requested:/)).not.toBeInTheDocument();
  });

  it("renders replayed runtime metadata events with fallback text", async () => {
    setRuntimeEntries([
      runtimeGenericEntry({
        id: "run-meta:2:1",
        kind: "generation_progress",
        text: "runtime setup downloading",
        eventId: 2,
      }),
      runtimeGenericEntry({
        id: "run-meta:3:2",
        kind: "llm_retry_scheduled",
        text: "retry scheduled visible",
        eventId: 3,
      }),
      runtimeGenericEntry({
        id: "run-meta:7:6",
        kind: "hook_started",
        text: "hook event visible",
        eventId: 7,
      }),
    ]);
    listSessionMessagesMock.mockResolvedValue([]);

    renderTimeline();

    expect(await screen.findByText("runtime setup downloading")).toBeVisible();
    expect(screen.getByText("retry scheduled visible")).toBeVisible();
    expect(screen.getByText("hook event visible")).toBeVisible();
  });

  it("keeps runtime token usage events out of the chat transcript", async () => {
    setRuntimeEntries([
      runtimeGenericEntry({
        id: "run-token:1:0",
        kind: "token_usage",
        text: "token usage",
        eventId: 1,
        payload: {
          cached_input_tokens: 2,
          input_tokens: 11,
          output_tokens: 7,
          reasoning_output_tokens: 3,
          total_tokens: 18,
        },
      }),
    ]);
    listSessionMessagesMock.mockResolvedValue([]);

    renderTimeline();

    expect(await screen.findByText("No messages yet")).toBeVisible();
    expect(
      screen.queryByText(
        "Token usage: Total 18 · Input 11 · Cached 2 · Output 7 · Reasoning 3",
      ),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("token usage")).not.toBeInTheDocument();
  });

  it("renders runtime state events as labelled state summaries", async () => {
    setRuntimeEntries([
      runtimeGenericEntry({
        id: "run-state:1:0",
        kind: "state_snapshot",
        text: "state snapshot",
        eventId: 1,
        payload: { title: "workspace context loaded" },
      }),
      runtimeGenericEntry({
        id: "run-state:2:1",
        kind: "state_delta",
        text: "state delta",
        eventId: 2,
        payload: {
          active: true,
          phase: "replaying",
          version: 12,
        },
      }),
    ]);
    listSessionMessagesMock.mockResolvedValue([]);

    renderTimeline();

    expect(
      await screen.findByText("State snapshot: workspace context loaded"),
    ).toBeVisible();
    expect(
      screen.getByText("State delta: active: true · phase: replaying · version: 12"),
    ).toBeVisible();
    expect(screen.queryByText("state snapshot")).not.toBeInTheDocument();
    expect(screen.queryByText("state delta")).not.toBeInTheDocument();
  });

  it("renders runtime lifecycle metadata events as labelled summaries", async () => {
    setRuntimeEntries([
      runtimeGenericEntry({
        id: "run-lifecycle:1:0",
        kind: "model_step_started",
        text: "model step started",
        eventId: 1,
        payload: {
          instance_id: "coordinator-1",
          role_id: "coordinator",
        },
      }),
      runtimeGenericEntry({
        id: "run-lifecycle:2:1",
        kind: "model_step_finished",
        text: "model step finished",
        eventId: 2,
        payload: { summary: "model pass complete" },
      }),
      runtimeGenericEntry({
        id: "run-lifecycle:3:2",
        kind: "notification_requested",
        text: "notification requested",
        eventId: 3,
        payload: {
          channels: ["desktop", "feishu"],
          notification_type: "run_failed",
          title: "Run failed",
        },
      }),
      runtimeGenericEntry({
        id: "run-lifecycle:4:3",
        kind: "background_task_started",
        text: "background task started",
        eventId: 4,
        payload: {
          background_task_id: "background-task-1",
          command: "npm run watch",
          kind: "command",
          status: "running",
        },
      }),
      runtimeGenericEntry({
        id: "run-lifecycle:5:4",
        kind: "background_task_updated",
        text: "background task updated",
        eventId: 5,
        payload: {
          background_task_id: "background-task-1",
          delta: "Compiled successfully",
          status: "running",
        },
      }),
      runtimeGenericEntry({
        id: "run-lifecycle:6:5",
        kind: "background_task_completed",
        text: "background task completed",
        eventId: 6,
        payload: {
          background_task_id: "background-task-1",
          exit_code: 0,
          output_excerpt: "Build finished",
          status: "completed",
        },
      }),
    ]);
    listSessionMessagesMock.mockResolvedValue([]);

    renderTimeline();

    expect(
      await screen.findByText("Notification: Run failed · type run_failed · channels desktop, feishu"),
    ).toBeVisible();
    expect(
      screen.queryByText("Model step started: role coordinator · instance coordinator-1"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Model step finished: model pass complete"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Compiled successfully")).not.toBeInTheDocument();
    expect(screen.queryByText("model step started")).not.toBeInTheDocument();
    expect(screen.queryByText("notification requested")).not.toBeInTheDocument();
    expect(screen.queryByText("background task started")).not.toBeInTheDocument();
    expect(screen.queryByText(/Background task/)).not.toBeInTheDocument();
    expect(screen.queryByText(/npm run watch/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Build finished/)).not.toBeInTheDocument();
  });

  it("routes interleaved background deltas to their matching tool calls", async () => {
    setRuntimeEntries([
      runtimeGenericEntry({
        id: "run-background-stream:1:0",
        kind: "tool_call",
        text: "shell",
        eventId: 1,
        payload: {
          args: { command: "python alpha.py" },
          tool_call_id: "call-alpha",
          action_family: "run",
          semantic_category: "execution",
          tool_name: "shell",
        },
      }),
      runtimeGenericEntry({
        id: "run-background-stream:2:1",
        kind: "tool_call",
        text: "shell",
        eventId: 2,
        payload: {
          args: { command: "python beta.py" },
          tool_call_id: "call-beta",
          action_family: "run",
          semantic_category: "execution",
          tool_name: "shell",
        },
      }),
      runtimeGenericEntry({
        id: "run-background-stream:3:2",
        kind: "background_task_updated",
        text: "background task updated",
        eventId: 3,
        payload: {
          background_task_id: "background-task-stream",
          delta: "STREAM_ALPHA ",
          status: "running",
          tool_call_id: "call-alpha",
        },
      }),
      runtimeGenericEntry({
        id: "run-background-stream:4:3",
        kind: "background_task_updated",
        text: "background task updated",
        eventId: 4,
        payload: {
          background_task_id: "background-task-beta",
          delta: "STREAM_BETA_ONLY",
          status: "running",
          tool_call_id: "call-beta",
        },
      }),
      runtimeGenericEntry({
        id: "run-background-stream:5:4",
        kind: "background_task_updated",
        text: "background task updated",
        eventId: 5,
        payload: {
          background_task_id: "background-task-stream",
          delta: "STREAM_ALPHA_DONE",
          status: "running",
          tool_call_id: "call-alpha",
        },
      }),
    ]);
    listSessionMessagesMock.mockResolvedValue([]);

    const { container } = renderTimeline();

    const toolDetails = await waitFor(() => {
      const elements = container.querySelectorAll<HTMLDetailsElement>(
        "details[data-tool-call-id]",
      );
      expect(elements).toHaveLength(2);
      return elements;
    });
    expect(container.querySelectorAll(".at-message-text")).toHaveLength(0);

    const alphaDetails = Array.from(toolDetails).find(
      (element) => element.dataset.toolCallId === "call-alpha",
    );
    expect(alphaDetails).toBeDefined();
    fireEvent.click(alphaDetails!.querySelector("summary")!);
    expect(alphaDetails).toHaveTextContent("STREAM_ALPHA STREAM_ALPHA_DONE");
    expect(alphaDetails).not.toHaveTextContent("STREAM_BETA_ONLY");

    const betaDetails = Array.from(toolDetails).find(
      (element) => element.dataset.toolCallId === "call-beta",
    );
    expect(betaDetails).toBeDefined();
    fireEvent.click(betaDetails!.querySelector("summary")!);
    expect(betaDetails).toHaveTextContent("STREAM_BETA_ONLY");
    expect(betaDetails).not.toHaveTextContent("STREAM_ALPHA_DONE");
  });

  it("does not promote an unassociated background delta to assistant text", async () => {
    setRuntimeEntries([
      runtimeGenericEntry({
        id: "run-orphan-background:1:0",
        kind: "background_task_updated",
        text: "background task updated",
        eventId: 1,
        payload: {
          background_task_id: "background-task-orphan",
          delta: "ORPHAN_TOOL_OUTPUT",
          status: "running",
        },
      }),
    ]);
    listSessionMessagesMock.mockResolvedValue([]);

    const { container } = renderTimeline();

    await waitFor(() => expect(listSessionMessagesMock).toHaveBeenCalled());
    expect(container.querySelector("article.at-message")).toBeNull();
    expect(screen.queryByText("ORPHAN_TOOL_OUTPUT")).not.toBeInTheDocument();
  });

  it("keeps child tool lifecycle and output out of the primary timeline", async () => {
    listSessionRoundsMock.mockResolvedValue({
      has_more: false,
      items: [{
        coordinator_messages: [],
        instance_role_map: {
          "child-instance": "Crafter",
          "root-instance": "MainAgent",
        },
        primary_role_id: "MainAgent",
        role_instance_map: {
          Crafter: "child-instance",
          MainAgent: "root-instance",
        },
        run_id: "run-output",
        run_status: "running",
      }],
      next_cursor: null,
    });
    setRuntimeEntries([
      runtimeGenericEntry({
        id: "root-output:1:0",
        instanceId: "root-instance",
        kind: "text_delta",
        roleId: "MainAgent",
        text: "ROOT_OUTPUT_VISIBLE",
        eventId: 1,
        payload: { text: "ROOT_OUTPUT_VISIBLE" },
      }),
      runtimeGenericEntry({
        id: "child-shell:2:1",
        instanceId: "child-instance",
        kind: "tool_call",
        roleId: "Crafter",
        text: "shell",
        eventId: 2,
        payload: {
          args: { command: "child command" },
          tool_call_id: "call-child-shell",
          action_family: "run",
          semantic_category: "execution",
          tool_name: "shell",
        },
      }),
      runtimeGenericEntry({
        id: "child-shell:3:2",
        instanceId: "child-instance",
        kind: "background_task_updated",
        roleId: "Crafter",
        text: "background task updated",
        eventId: 3,
        payload: {
          background_task_id: "background-child-shell",
          delta: "CHILD_STDOUT_HIDDEN",
          instance_id: "child-instance",
          role_id: "Crafter",
          status: "running",
          tool_call_id: "call-child-shell",
        },
      }),
    ], "open");
    listSessionMessagesMock.mockResolvedValue([]);

    const { container } = renderTimeline("session-1", {
      primaryRoleId: "MainAgent",
    });

    expect(await screen.findByText("ROOT_OUTPUT_VISIBLE")).toBeVisible();
    await waitFor(() => {
      expect(container.querySelector('[data-instance-id="child-instance"]')).toBeNull();
    });
    expect(screen.queryByText("Running: shell")).not.toBeInTheDocument();
    expect(screen.queryByText("CHILD_STDOUT_HIDDEN")).not.toBeInTheDocument();
  });

  it("hides internal coordination events from the transcript while keeping recovery events visible", async () => {
    setRuntimeEntries([
      runtimeGenericEntry({
        id: "run-coordination:1:0",
        kind: "user_question_requested",
        text: "user question requested",
        eventId: 1,
        payload: {
          question_id: "question-1",
          questions: [{ question: "Pick deployment target" }],
        },
      }),
      runtimeGenericEntry({
        id: "run-coordination:2:1",
        kind: "user_question_answered",
        text: "user question answered",
        eventId: 2,
        payload: {
          answers: [{ selections: [{ label: "Production" }] }],
          question_id: "question-1",
        },
      }),
      runtimeGenericEntry({
        id: "run-coordination:3:2",
        kind: "injection_enqueued",
        text: "injection enqueued",
        eventId: 3,
        payload: {
          content: [{ kind: "text", text: "Please retry with logs" }],
          delivery_mode: "queued",
          recipient_instance_id: "worker-1",
          source: "user",
          visibility: "internal",
        },
      }),
      runtimeGenericEntry({
        id: "run-coordination:4:3",
        kind: "injection_applied",
        text: "injection applied",
        eventId: 4,
        payload: {
          content: "System reminder",
          internal_delivery_mode: "guidance",
          recipient_instance_id: "worker-1",
          source: "system",
          visibility: "internal",
        },
      }),
      runtimeGenericEntry({
        id: "run-coordination:5:4",
        kind: "subagent_session_status_changed",
        text: "subagent session status changed",
        eventId: 5,
        payload: {
          run_phase: "subagent_running",
          status: "running",
          subagent_instance_id: "subagent-1",
          subagent_role_id: "reviewer",
          title: "Review PR",
        },
      }),
      runtimeGenericEntry({
        id: "run-coordination:6:5",
        kind: "subagent_stopped",
        text: "subagent stopped",
        eventId: 6,
        payload: {
          instance_id: "subagent-1",
          reason: "stopped_by_user",
          role_id: "reviewer",
          task_id: "task-1",
        },
      }),
      runtimeGenericEntry({
        id: "run-coordination:7:6",
        kind: "subagent_resumed",
        text: "subagent resumed",
        eventId: 7,
        payload: {
          instance_id: "subagent-1",
          role_id: "reviewer",
          task_id: "task-1",
        },
      }),
      runtimeGenericEntry({
        id: "run-coordination:8:7",
        kind: "awaiting_manual_action",
        text: "awaiting manual action",
        eventId: 8,
        payload: { root_task_id: "root-1" },
      }),
      runtimeGenericEntry({
        id: "run-coordination:9:8",
        kind: "run_started",
        text: "run started",
        eventId: 9,
        payload: { phase: "streaming" },
      }),
      runtimeGenericEntry({
        id: "run-coordination:10:9",
        kind: "run_failed",
        text: "run failed",
        eventId: 10,
        payload: {
          error: "Provider failed",
          root_task_id: "root-1",
          status: "failed",
        },
      }),
    ]);
    listSessionMessagesMock.mockResolvedValue([]);

    renderTimeline();

    await screen.findByText("Awaiting manual action: root task root-1");
    expect(
      screen.queryByText("User question: Pick deployment target · #question-1"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("User question answered: 1 answer · #question-1"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        "Injection queued: Please retry with logs · source user · mode queued · to worker-1",
      ),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        "Injection applied: System reminder · source system · mode guidance · to worker-1",
      ),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        "Subagent status: Review PR · status running · phase subagent_running · role reviewer · instance subagent-1",
      ),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        "Subagent stopped: reason stopped_by_user · role reviewer · instance subagent-1 · task task-1",
      ),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Subagent resumed: role reviewer · instance subagent-1 · task task-1"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Awaiting manual action: root task root-1")).toBeVisible();
    expect(screen.queryByText("Run started: phase: streaming")).not.toBeInTheDocument();
    expect(
      screen.getByText("Run failed: status failed · Provider failed · root task root-1"),
    ).toBeVisible();
    expect(screen.queryByText("user question requested")).not.toBeInTheDocument();
    expect(screen.queryByText("injection enqueued")).not.toBeInTheDocument();
    expect(screen.queryByText("subagent session status changed")).not.toBeInTheDocument();
    expect(screen.queryByText("subagent stopped")).not.toBeInTheDocument();
    expect(screen.queryByText("subagent resumed")).not.toBeInTheDocument();
  });

  it("renders runtime todo update events as compact todo summaries", async () => {
    setRuntimeEntries([
      runtimeGenericEntry({
        id: "run-todo:1:0",
        kind: "todo_updated",
        text: "todo updated",
        eventId: 1,
        payload: {
          items: [
            { content: "Inspect replay recovery", status: "completed" },
            { content: "Verify todo stream summary", status: "in_progress" },
            { content: "Capture final evidence", status: "pending" },
          ],
          run_id: "run-output",
          session_id: "session-1",
          updated_by_instance_id: "MainAgent",
          version: 3,
        },
      }),
    ]);
    listSessionMessagesMock.mockResolvedValue([]);

    renderTimeline();

    expect(
      await screen.findByText(
        "Todo updated: 3 items · 1 completed, 1 in_progress, 1 pending · Current Verify todo stream summary · v3 · by MainAgent",
      ),
    ).toBeVisible();
    expect(screen.queryByText("todo updated")).not.toBeInTheDocument();
  });

  it("does not render scoped subagent runtime output in the parent session timeline", async () => {
    setRuntimeEntries([
      {
        id: "subagent-run-1:1:0",
        instanceId: "subagent-instance-1",
        sessionId: "session-1",
        runId: "subagent-run-1",
        roleId: "Explorer",
        kind: "text_delta",
        text: "Subagent stream should stay in the side panel.",
        payload: { text: "Subagent stream should stay in the side panel." },
        eventId: 1,
        occurredAt: "2026-06-23T00:00:00Z",
      },
    ], "open", {
      scope: "subagent",
      sessionId: "session-1",
      targetRoleId: "Explorer",
    });
    listSessionMessagesMock.mockResolvedValue([
      {
        content: "Main timeline answer stays visible.",
        message_id: "main-answer",
        role_id: "MainAgent",
        run_id: "main-run",
      },
    ]);

    renderTimeline("session-1", { primaryRoleId: null });

    expect(await screen.findByText("Main timeline answer stays visible."))
      .toBeVisible();
    expect(
      screen.queryByText("Subagent stream should stay in the side panel."),
    ).not.toBeInTheDocument();
  });

  it("subscribes only the current main run or explicitly opened subagent at scale", async () => {
    const runs: Record<string, RuntimeRunState> = {};
    for (let sessionIndex = 0; sessionIndex < 30; sessionIndex += 1) {
      const sessionId = `session-${sessionIndex + 1}`;
      const runId = `main-run-${sessionIndex + 1}`;
      runs[runId] = runtimeRunStateWithSingleText({
        runId,
        scope: "session",
        sessionId,
        text: `Main output ${sessionIndex + 1}`,
      });
    }
    for (let subagentIndex = 0; subagentIndex < 30; subagentIndex += 1) {
      const runId = `subagent-run-${subagentIndex + 1}`;
      runs[runId] = runtimeRunStateWithSingleText({
        runId,
        scope: "subagent",
        sessionId: "session-1",
        text: `Subagent output ${subagentIndex + 1}`,
      });
    }
    useRuntimeStore.setState({
      runtimeState: {
        activeRunIds: Object.keys(runs),
        runs,
      },
    });
    listSessionMessagesMock.mockResolvedValue([]);

    const mainRender = renderTimeline("session-1");
    expect(await screen.findByText("Main output 1")).toBeVisible();
    expect(mainRender.container.querySelector(".at-timeline"))
      .toHaveAttribute("data-runtime-run-count", "1");
    expect(screen.queryByText("Subagent output 1")).not.toBeInTheDocument();

    const subagentRender = renderTimeline("session-1", {
      roundsEnabled: false,
      runtimeRunId: "subagent-run-17",
      variant: "subagent-panel",
    });
    expect(await screen.findByText("Subagent output 17")).toBeVisible();
    expect(subagentRender.container.querySelector(".at-timeline"))
      .toHaveAttribute("data-runtime-run-count", "1");
    expect(screen.queryByText("Subagent output 18")).not.toBeInTheDocument();
  });

  it("does not treat generic tool run identifiers as subagent previews", async () => {
    setRuntimeEntries([
      runtimeGenericEntry({
        id: "run-shell-result:1:0",
        kind: "tool_result",
        text: "tool result",
        eventId: 1,
        payload: {
          result: {
            instance_id: "shell-instance-1",
            output: "SHELL_DONE",
            role_id: "Crafter",
            run_id: "shell-run-1",
          },
          tool_call_id: "call-shell-1",
          action_family: "run",
          semantic_category: "execution",
          tool_name: "shell",
        },
      }),
    ]);
    listSessionMessagesMock.mockResolvedValue([]);

    const { container } = renderTimeline();

    await waitFor(() =>
      expect(container.querySelector(".at-message-tool-title"))
        .toHaveTextContent("Ran: shell"),
    );
    const tool = container.querySelector(".at-message-tool");
    expect(tool).not.toBeNull();
    expect(tool).not.toHaveClass("is-openable-subagent");
    expect(container.querySelector(".at-message-tool-preview"))
      .toHaveTextContent("SHELL_DONE");
    expect(container.querySelector(".at-message-tool-preview"))
      .not.toHaveTextContent("Crafter");
  });

  it("strips frontmatter and renders markdown tables, links, and code blocks", async () => {
    listSessionMessagesMock.mockResolvedValue([
      {
        content: [
          "---",
          "name: skill-creator",
          "description: Create skills.",
          "---",
          "# Release Notes",
          "",
          "- Added offline markdown rendering",
          "- Removed CDN hard dependency",
          "",
          "> Works without external scripts.",
          "",
          "| Step | State |",
          "| --- | --- |",
          "| Timeline | Done |",
          "",
          "Open the [docs](/docs).",
          "",
          "```python",
          "print(\"ok\")",
          "```",
          "",
          "```ts",
          "const answer = \"yes\";",
          "```",
        ].join("\n"),
        message_id: "assistant-markdown",
        role_id: "MainAgent",
      },
    ]);

    const { container } = renderTimeline();

    expect(
      await screen.findByRole("heading", { level: 1, name: "Release Notes" }),
    ).toBeVisible();
    expect(screen.queryByText("name: skill-creator")).not.toBeInTheDocument();
    expect(screen.queryByText("description: Create skills.")).not.toBeInTheDocument();
    expect(screen.getByText("Added offline markdown rendering")).toBeVisible();
    expect(screen.getByText("Works without external scripts.")).toBeVisible();
    expect(screen.getByRole("link", { name: "docs" })).toHaveAttribute(
      "href",
      "/docs",
    );
    expect(screen.getByRole("cell", { name: "Timeline" })).toBeVisible();
    expect(screen.getByRole("cell", { name: "Done" })).toBeVisible();
    const pythonBlock = container.querySelector("pre code.language-python");
    expect(pythonBlock).not.toBeNull();
    expect(pythonBlock).toHaveTextContent("print(\"ok\")");
    const codeBlock = container.querySelector("pre code.language-ts");
    expect(codeBlock).not.toBeNull();
    expect(codeBlock).toHaveTextContent("const answer = \"yes\";");
    expect(codeBlock?.querySelector(".hljs-keyword")).not.toBeNull();
  });

  it("keeps the timeline pinned to bottom when new rows arrive near bottom", async () => {
    const restoreMeasurements = mockElementMeasurements({
      clientHeight: 320,
      rowHeight: 120,
    });
    try {
      listSessionMessagesMock.mockResolvedValue(
        Array.from({ length: 6 }, (_, index) => ({
          content: `Persisted message ${index + 1}`,
          message_id: `assistant-${index + 1}`,
          role_id: "MainAgent",
        })),
      );

      const { container } = renderTimeline();

      expect(await screen.findByText("Persisted message 6")).toBeVisible();
      const timeline = timelineElement(container);
      await waitFor(() =>
        expect(timelineMaxScrollTop(timeline)).toBeGreaterThan(0),
      );
      timeline.scrollTop = timelineMaxScrollTop(timeline) - 24;
      fireEvent.scroll(timeline);

      act(() => {
        setRuntimeEntries([
          runtimeTextDeltaEntry({
            eventId: 1,
            id: "run-output:1:0",
            text: "New runtime row",
          }),
        ]);
      });

      expect(await screen.findByText("New runtime row")).toBeVisible();
      await waitFor(() =>
        expect(timeline.scrollTop).toBe(timelineMaxScrollTop(timeline)),
      );
    } finally {
      restoreMeasurements();
    }
  });

  it("retains virtual row shells while hydrating offscreen content on the next frame", async () => {
    const restoreMeasurements = mockElementMeasurements({
      clientHeight: 180,
      rowHeight: 84,
    });
    const animationFrames: FrameRequestCallback[] = [];
    const requestAnimationFrame = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback) => {
        animationFrames.push(callback);
        return animationFrames.length;
      });
    const cancelAnimationFrame = vi
      .spyOn(window, "cancelAnimationFrame")
      .mockImplementation(() => undefined);
    try {
      listSessionMessagesMock.mockResolvedValue(
        Array.from({ length: 20 }, (_, index) => ({
          content: `Hydration message ${index + 1}`,
          message_id: `hydration-message-${index + 1}`,
          role_id: "MainAgent",
        })),
      );

      const { container } = renderTimeline();

      expect(await screen.findByText("Hydration message 20")).toBeVisible();
      const timeline = timelineElement(container);
      await waitFor(() =>
        expect(timeline.scrollTop).toBe(timelineMaxScrollTop(timeline)),
      );
      const renderedRowCount = Number(timeline.dataset.renderedRowCount);
      expect(container.querySelectorAll(".at-timeline-row"))
        .toHaveLength(renderedRowCount);
      expect(container.querySelectorAll(".at-timeline-row-placeholder").length)
        .toBeGreaterThan(0);
      expect(screen.getByText("Hydration message 20")).toBeVisible();

      act(() => {
        const callbacks = animationFrames.splice(0);
        callbacks.forEach((callback) => callback(performance.now()));
      });

      await waitFor(() =>
        expect(container.querySelector(".at-timeline-row-placeholder"))
          .not.toBeInTheDocument(),
      );
      expect(container.querySelectorAll(".at-timeline-row"))
        .toHaveLength(Number(timeline.dataset.renderedRowCount));
    } finally {
      requestAnimationFrame.mockRestore();
      cancelAnimationFrame.mockRestore();
      restoreMeasurements();
    }
  });

  it("preserves scroll position when new rows arrive away from bottom", async () => {
    const restoreMeasurements = mockElementMeasurements({
      clientHeight: 320,
      rowHeight: 120,
    });
    try {
      listSessionMessagesMock.mockResolvedValue(
        Array.from({ length: 6 }, (_, index) => ({
          content: `Persisted message ${index + 1}`,
          message_id: `assistant-${index + 1}`,
          role_id: "MainAgent",
        })),
      );

      const { container } = renderTimeline();

      expect(await screen.findByText("Persisted message 6")).toBeVisible();
      const timeline = timelineElement(container);
      await waitFor(() =>
        expect(timelineMaxScrollTop(timeline)).toBeGreaterThan(240),
      );
      timeline.scrollTop = 80;
      fireEvent.scroll(timeline);
      const previousMaxScrollTop = timelineMaxScrollTop(timeline);

      act(() => {
        setRuntimeEntries([
          runtimeTextDeltaEntry({
            eventId: 1,
            id: "run-output:1:0",
            text: "Away-from-bottom runtime row",
          }),
        ]);
      });

      await waitFor(() =>
        expect(timelineMaxScrollTop(timeline)).toBeGreaterThan(previousMaxScrollTop),
      );
      expect(timeline.scrollTop).toBe(80);
      const jumpToLatest = screen.getByRole("button", {
        name: "Jump to latest content",
      });
      expect(jumpToLatest).toBeVisible();
      fireEvent.click(jumpToLatest);
      expect(timeline.scrollTop).toBe(timelineMaxScrollTop(timeline));
      expect(screen.queryByRole("button", { name: "Jump to latest content" }))
        .not.toBeInTheDocument();
    } finally {
      restoreMeasurements();
    }
  });

  it("keeps a running subagent timeline scrollable while one streamed row grows", async () => {
    const restoreMeasurements = mockElementMeasurements({
      clientHeight: 180,
      rowHeight: (row) => {
        const textLength = row.querySelector(".at-message-markdown")
          ?.textContent?.length ?? 0;
        return 48 + Math.ceil(textLength / 32) * 18;
      },
    });
    const restoreRects = mockTimelineRects();
    const streamingEntries = (count: number) =>
      Array.from({ length: count }, (_, index) => runtimeTextDeltaEntry({
        eventId: index + 1,
        id: `run-output:${index + 1}:${index}`,
        text: `Token ${index + 1} keeps streaming. `,
      }));
    try {
      setRuntimeEntries(streamingEntries(24), "open", {
        scope: "subagent",
        sessionId: "session-1",
      });
      listSessionMessagesMock.mockResolvedValue([]);

      const { container } = renderTimeline("session-1", {
        runtimeRunId: "run-output",
        variant: "subagent-panel",
      });

      const timeline = timelineElement(container);
      await waitFor(() => {
        expect(container.querySelector(".at-message-markdown")?.textContent)
          .toContain("Token 24 keeps streaming.");
        expect(timelineMaxScrollTop(timeline)).toBeGreaterThan(180);
      });
      const awayFromBottom = timelineMaxScrollTop(timeline) - 120;
      timeline.scrollTop = awayFromBottom;
      fireEvent.scroll(timeline);

      act(() => {
        setRuntimeEntries(streamingEntries(48), "open", {
          scope: "subagent",
          sessionId: "session-1",
        });
      });

      await waitFor(() => {
        expect(container.querySelector(".at-message-markdown")?.textContent)
          .toContain("Token 48 keeps streaming.");
        expect(timelineMaxScrollTop(timeline)).toBeGreaterThan(520);
      });
      expect(timeline.scrollTop).toBe(awayFromBottom);
      expect(screen.getByRole("button", { name: "Jump to latest content" }))
        .toBeVisible();

      act(() => {
        setRuntimeEntries(streamingEntries(96), "closed", {
          scope: "subagent",
          sessionId: "session-1",
        });
      });

      await waitFor(() => {
        expect(container.querySelector(".at-message-markdown")?.textContent)
          .toContain("Token 96 keeps streaming.");
        expect(timelineMaxScrollTop(timeline)).toBeGreaterThan(1_100);
      });
      expect(timeline.scrollTop).toBe(awayFromBottom);
    } finally {
      restoreRects();
      restoreMeasurements();
    }
  });

  it("restores independent timeline anchors after switching sessions", async () => {
    const restoreMeasurements = mockElementMeasurements({
      clientHeight: 320,
      rowHeight: 120,
    });
    try {
      listSessionMessagesMock.mockImplementation(async (sessionId) =>
        Array.from({ length: 8 }, (_, index) => ({
          content: `${sessionId} history ${index + 1}`,
          message_id: `${sessionId}-message-${index + 1}`,
          role_id: "MainAgent",
        }))
      );

      function SessionScrollHarness() {
        const [sessionId, setSessionId] = useState("session-1");
        const [queryClient] = useState(() => new QueryClient({
          defaultOptions: {
            queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
          },
        }));
        return (
          <QueryClientProvider client={queryClient}>
            <ConfigProvider>
              <AntApp>
                <button onClick={() => setSessionId("session-1")} type="button">
                  Scroll session 1
                </button>
                <button onClick={() => setSessionId("session-2")} type="button">
                  Scroll session 2
                </button>
                <MessageTimeline sessionId={sessionId} />
              </AntApp>
            </ConfigProvider>
          </QueryClientProvider>
        );
      }

      const { container } = render(<SessionScrollHarness />);
      expect(await screen.findByText("session-1 history 8")).toBeVisible();
      const sessionOneTimeline = timelineElement(container);
      sessionOneTimeline.scrollTop = 120;
      fireEvent.scroll(sessionOneTimeline);

      fireEvent.click(screen.getByRole("button", { name: "Scroll session 2" }));
      expect(await screen.findByText("session-2 history 8")).toBeVisible();
      const sessionTwoTimeline = timelineElement(container);
      sessionTwoTimeline.scrollTop = 360;
      fireEvent.scroll(sessionTwoTimeline);

      for (let repetition = 0; repetition < 20; repetition += 1) {
        fireEvent.click(screen.getByRole("button", { name: "Scroll session 1" }));
        expect(await screen.findByText("session-1 history 8")).toBeVisible();
        await waitFor(() =>
          expect(Math.abs(timelineElement(container).scrollTop - 120))
            .toBeLessThanOrEqual(12),
        );

        fireEvent.click(screen.getByRole("button", { name: "Scroll session 2" }));
        expect(await screen.findByText("session-2 history 8")).toBeVisible();
        await waitFor(() =>
          expect(Math.abs(timelineElement(container).scrollTop - 360))
            .toBeLessThanOrEqual(12),
        );
      }
    } finally {
      restoreMeasurements();
    }
  });

  it("preserves the current view when stream updates after opening tool details", async () => {
    const restoreMeasurements = mockElementMeasurements({
      clientHeight: 320,
      rowHeight: 120,
    });
    try {
      const toolCall = runtimeToolCallEntry({
        eventId: 1,
        id: "run-output:1:0",
      });
      setRuntimeEntries([toolCall], "open");
      listSessionMessagesMock.mockResolvedValue(
        Array.from({ length: 6 }, (_, index) => ({
          content: `Persisted message ${index + 1}`,
          message_id: `assistant-${index + 1}`,
          role_id: "MainAgent",
        })),
      );

      const { container } = renderTimeline();

      expect(await screen.findByText("Running: execute_command")).toBeVisible();
      const timeline = timelineElement(container);
      await waitFor(() =>
        expect(timelineMaxScrollTop(timeline)).toBeGreaterThan(0),
      );
      timeline.scrollTop = timelineMaxScrollTop(timeline);
      fireEvent.scroll(timeline);
      const previousScrollTop = timeline.scrollTop;
      const toolSummary = container.querySelector<HTMLElement>(
        ".at-message-tool-summary",
      );
      expect(toolSummary).not.toBeNull();
      const toolRow = toolSummary?.closest<HTMLElement>(
        ".at-timeline-row[data-row-key]",
      );
      expect(toolRow).not.toBeNull();
      const headerViewportOffsetBefore = translateY(toolRow ?? null) -
        timeline.scrollTop;
      fireEvent.pointerDown(toolSummary as HTMLElement);
      fireEvent.click(toolSummary as HTMLElement);
      const toolDetails = toolSummary?.closest("details.at-message-tool");
      expect(toolDetails).toHaveAttribute("open");
      expect(screen.queryByRole("button", { name: "Jump to latest content" }))
        .not.toBeInTheDocument();

      act(() => {
        setRuntimeEntries([
          toolCall,
          runtimeTextDeltaEntry({
            eventId: 2,
            id: "run-output:2:1",
            text: "Stream output while inspecting details",
          }),
        ], "open");
      });

      expect(await screen.findByText("Stream output while inspecting details"))
        .toBeVisible();
      expect(toolDetails).toHaveAttribute("open");
      await waitFor(() =>
        expect(timelineMaxScrollTop(timeline)).toBeGreaterThan(previousScrollTop),
      );
      expect(timeline.scrollTop).toBe(previousScrollTop);
      expect(
        translateY(toolRow ?? null) - timeline.scrollTop,
      ).toBe(headerViewportOffsetBefore);
    } finally {
      restoreMeasurements();
    }
  });

  it("preserves the anchored row when replay hydration inserts rows before the viewport", async () => {
    const restoreMeasurements = mockElementMeasurements({
      clientHeight: 320,
      rowHeight: 120,
    });
    const roundsDeferred = deferredSessionRounds();
    try {
      listSessionMessagesMock.mockResolvedValue(
        Array.from({ length: 6 }, (_, index) => ({
          content: `Persisted message ${index + 1}`,
          message_id: `assistant-${index + 1}`,
          role_id: "MainAgent",
          trace_id: `run-${index + 1}`,
        })),
      );
      listSessionRoundsMock
        .mockResolvedValueOnce({ has_more: false, items: [], next_cursor: null })
        .mockReturnValueOnce(roundsDeferred.promise);

      const { container, queryClient } = renderTimeline();

      expect(await screen.findByText("Persisted message 6")).toBeVisible();
      const timeline = timelineElement(container);
      const anchorRow = container.querySelector(
        'article.at-message[data-row-key="message:assistant-4"]',
      );
      expect(anchorRow).not.toBeNull();
      const anchorTop = translateY(anchorRow);
      timeline.scrollTop = anchorTop + 10;
      fireEvent.scroll(timeline);

      const refreshPromise = queryClient.invalidateQueries({
        queryKey: ["sessions", "session-1", "rounds", "rail"],
      });

      const originalQuerySelectorAll = timeline.querySelectorAll.bind(timeline);
      const querySelectorAllSpy = vi
        .spyOn(timeline, "querySelectorAll")
        .mockImplementation((selectors: string) => {
          if (selectors === ".at-timeline-row[data-row-key]") {
            return [] as unknown as NodeListOf<Element>;
          }
          return originalQuerySelectorAll(selectors);
        });
      roundsDeferred.resolve({
        has_more: false,
        items: Array.from({ length: 6 }, (_, index) => ({
          created_at: `2026-06-23T12:4${index}:00Z`,
          run_id: `run-${index + 1}`,
          run_status: "completed",
          run_user_message: `Round ${index + 1}`,
        })),
        next_cursor: null,
      });
      await act(async () => refreshPromise);

      await waitFor(() => {
        expect(timeline).toHaveAttribute("data-total-row-count", "12");
        expect(container.querySelectorAll(".at-round-marker").length)
          .toBeGreaterThanOrEqual(5);
      });
      expect(timeline.scrollTop).toBeGreaterThan(anchorTop + 180);
      expect(timeline.scrollTop).not.toBe(anchorTop + 10);
      querySelectorAllSpy.mockRestore();
    } finally {
      restoreMeasurements();
    }
  });

  it("measures markdown rows so long blocks do not overlap following messages", async () => {
    const restoreMeasurements = mockElementMeasurements();
    try {
      listSessionMessagesMock.mockResolvedValue([
        {
          content: [
            "```ts",
            ...Array.from(
              { length: 36 },
              (_, index) => `const line${index} = "long";`,
            ),
            "```",
          ].join("\n"),
          message_id: "assistant-long-markdown",
          role_id: "MainAgent",
        },
        {
          content: "After long markdown",
          message_id: "assistant-after-markdown",
          role_id: "MainAgent",
        },
      ]);

      const { container } = renderTimeline();

      expect(await screen.findByText("After long markdown")).toBeVisible();
      await waitFor(() => {
        const secondRow = container.querySelector(
          'article.at-message[data-index="1"]',
        );
        expect(secondRow).not.toBeNull();
        expect(translateY(secondRow)).toBeGreaterThan(600);
      });
    } finally {
      restoreMeasurements();
    }
  });
});

interface RenderTimelineOptions {
  fallbackRunId?: string | null;
  latestTerminalRunId?: string | null;
  latestTerminalRunStatus?: string | null;
  onSubagentOpen?: Parameters<typeof MessageTimeline>[0]["onSubagentOpen"];
  pausedSubagent?: Parameters<typeof MessageTimeline>[0]["pausedSubagent"];
  primaryRoleId?: string | null;
  roundsEnabled?: boolean;
  runtimeRunId?: string | null;
  subagentScopeInstanceId?: string | null;
  subagentScopeRoleId?: string | null;
  subagentScopeTaskId?: string | null;
  variant?: Parameters<typeof MessageTimeline>[0]["variant"];
  visible?: boolean;
  workspaceId?: string | null;
}

function renderTimeline(
  sessionId: string | null = "session-1",
  options: RenderTimelineOptions = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: Number.POSITIVE_INFINITY,
      },
    },
  });
  return {
    ...render(
    <QueryClientProvider client={queryClient}>
      <ConfigProvider>
        <AntApp>
          <MessageTimeline
            fallbackRunId={options.fallbackRunId ?? null}
            latestTerminalRunId={options.latestTerminalRunId ?? null}
            latestTerminalRunStatus={options.latestTerminalRunStatus ?? null}
            onSubagentOpen={options.onSubagentOpen}
            pausedSubagent={options.pausedSubagent ?? null}
            primaryRoleId={options.primaryRoleId ?? null}
            roundsEnabled={options.roundsEnabled ?? true}
            sessionId={sessionId}
            runtimeRunId={options.runtimeRunId ?? null}
            subagentScopeInstanceId={options.subagentScopeInstanceId ?? null}
            subagentScopeRoleId={options.subagentScopeRoleId ?? null}
            subagentScopeTaskId={options.subagentScopeTaskId ?? null}
            variant={options.variant ?? "session"}
            visible={options.visible ?? true}
            workspaceId={options.workspaceId ?? null}
          />
        </AntApp>
      </ConfigProvider>
    </QueryClientProvider>,
    ),
    queryClient,
  };
}

function deferredSessionRounds(): {
  promise: Promise<Awaited<ReturnType<typeof listSessionRounds>>>;
  resolve: (value: Awaited<ReturnType<typeof listSessionRounds>>) => void;
} {
  let resolvePromise:
    | ((value: Awaited<ReturnType<typeof listSessionRounds>>) => void)
    | null = null;
  const promise = new Promise<Awaited<ReturnType<typeof listSessionRounds>>>(
    (resolve) => {
      resolvePromise = resolve;
    },
  );
  return {
    promise,
    resolve: (value) => {
      if (resolvePromise === null) {
        throw new Error("Rounds promise resolver was not initialized.");
      }
      resolvePromise(value);
    },
  };
}

function setRuntimeEntries(
  entries: TimelineEntry[],
  status: StreamStatus = "closed",
  options: RuntimeRunStateOptions = {},
): void {
  const runId = entries[0]?.runId ?? "run-output";
  const lastEventId = entries.reduce(
    (latest, entry) => Math.max(latest, entry.eventId),
    0,
  );
  const runState: RuntimeRunState = {
    runId,
    ...optionalRuntimeRunStateValues(options),
    status,
    lastEventId,
    seenEventKeys: [],
    terminalEventType: null,
    entries,
  };
  useRuntimeStore.setState({
    runtimeState: {
      activeRunIds: status === "open" ? [runId] : [],
      runs: {
        [runId]: runState,
      },
    },
  });
}

function runtimeRunStateWithSingleText({
  runId,
  scope,
  sessionId,
  text,
}: {
  runId: string;
  scope: NonNullable<RuntimeRunState["scope"]>;
  sessionId: string;
  text: string;
}): RuntimeRunState {
  return {
    entries: [{
      eventId: 1,
      id: `${runId}:1:0`,
      kind: "text_delta",
      occurredAt: "2026-07-11T15:00:00Z",
      payload: { text },
      roleId: scope === "subagent" ? "Explorer" : "MainAgent",
      runId,
      sessionId,
      text,
    }],
    lastEventId: 1,
    runId,
    scope,
    seenEventKeys: [],
    sessionId,
    status: "open",
    terminalEventType: null,
  };
}

interface RuntimeRunStateOptions {
  createdAt?: string;
  promptText?: string;
  sessionId?: string;
  scope?: RuntimeRunState["scope"];
  targetRoleId?: string;
}

function optionalRuntimeRunStateValues(
  options: RuntimeRunStateOptions,
): Partial<RuntimeRunState> {
  const values: Partial<RuntimeRunState> = {};
  if (options.sessionId !== undefined) {
    values.sessionId = options.sessionId;
  }
  if (options.scope !== undefined) {
    values.scope = options.scope;
  }
  if (options.promptText !== undefined) {
    values.promptText = options.promptText;
  }
  if (options.createdAt !== undefined) {
    values.createdAt = options.createdAt;
  }
  if (options.targetRoleId !== undefined) {
    values.targetRoleId = options.targetRoleId;
  }
  return values;
}

function setRuntimeStateFromEvents(events: RelayRunEvent[]): void {
  useRuntimeStore.setState({
    runtimeState: events.reduce(reduceRunEvent, initialRuntimeState),
  });
}

function markRuntimeRunAsSubagent(runId: string, targetRoleId: string): void {
  const runtimeState = useRuntimeStore.getState().runtimeState;
  const runState = runtimeState.runs[runId];
  if (runState === undefined) {
    throw new Error(`Missing runtime fixture run: ${runId}`);
  }
  useRuntimeStore.setState({
    runtimeState: {
      ...runtimeState,
      runs: {
        ...runtimeState.runs,
        [runId]: {
          ...runState,
          scope: "subagent",
          targetRoleId,
        },
      },
    },
  });
}

function openProcessedGroup(container: HTMLElement): HTMLDetailsElement {
  const group = container.querySelector("details.at-processed-group");
  if (!(group instanceof HTMLDetailsElement)) {
    throw new Error("Processed group was not rendered.");
  }
  const summary = group.querySelector(".at-processed-group-summary");
  if (!(summary instanceof HTMLElement)) {
    throw new Error("Processed group summary was not rendered.");
  }
  if (!group.open) {
    fireEvent.click(summary);
  }
  expect(group).toHaveAttribute("open");
  return group;
}

async function waitForSingleVisibleText(text: string): Promise<HTMLElement> {
  let visibleElement: HTMLElement | null = null;
  await waitFor(() => {
    const matches = screen.queryAllByText(text);
    expect(matches).toHaveLength(1);
    const [match] = matches;
    expect(match).toBeVisible();
    visibleElement = match;
  });
  if (visibleElement === null) {
    throw new Error(`Text did not become visible: ${text}`);
  }
  return visibleElement;
}

async function waitForToolPreviews(
  container: HTMLElement,
  expected: string[],
): Promise<void> {
  await waitFor(() => expect(toolPreviewTexts(container)).toEqual(expected));
}

function answerRowSequence(
  container: HTMLElement,
  expectedTexts: string[],
): Array<{ key: string; text: string }> {
  const expected = new Set(expectedTexts);
  return Array.from(container.querySelectorAll<HTMLElement>(
    "article.at-message[data-row-key]",
  )).flatMap((row) => {
    const text = row.querySelector<HTMLElement>(".at-message-text")?.textContent ?? "";
    return expected.has(text)
      ? [{ key: row.dataset.rowKey ?? "", text }]
      : [];
  });
}

function relayRunEvent(overrides: Partial<RelayRunEvent>): RelayRunEvent {
  return {
    event_id: 1,
    event_type: "text_delta",
    occurred_at: "2026-06-23T00:00:00Z",
    payload_json: "{}",
    role_id: "MainAgent",
    run_id: "run-output",
    session_id: "session-1",
    trace_id: "run-output",
    ...overrides,
  };
}

function runtimeTextDeltaEntry({
  id,
  instanceId = "",
  payload,
  text,
  eventId,
}: {
  id: string;
  instanceId?: string;
  payload?: TimelineEntry["payload"];
  text: string;
  eventId: number;
}): TimelineEntry {
  return {
    id,
    instanceId,
    sessionId: "session-1",
    runId: "run-output",
    roleId: "MainAgent",
    kind: "text_delta",
    text,
    payload: payload ?? { text },
    eventId,
    occurredAt: "2026-06-23T00:00:00Z",
  };
}

function runtimeOutputDeltaEntry({
  id,
  instanceId = "",
  payload,
  text = "output delta",
  eventId = 1,
}: {
  id: string;
  instanceId?: string;
  payload: TimelineEntry["payload"];
  text?: string;
  eventId?: number;
}): TimelineEntry {
  return {
    id,
    instanceId,
    sessionId: "session-1",
    runId: "run-output",
    roleId: "MainAgent",
    kind: "output_delta",
    text,
    payload,
    eventId,
    occurredAt: "2026-06-23T00:00:00Z",
  };
}

function runtimeToolCallEntry({
  id,
  instanceId = "",
  eventId,
}: {
  id: string;
  instanceId?: string;
  eventId: number;
}): TimelineEntry {
  return {
    id,
    instanceId,
    sessionId: "session-1",
    runId: "run-output",
    roleId: "MainAgent",
    kind: "tool_call",
    text: "execute_command",
    payload: {
      args: { cmd: "npm test" },
      tool_call_id: "tool-live-1",
      action_family: "run",
      semantic_category: "execution",
      tool_name: "execute_command",
    },
    eventId,
    occurredAt: "2026-06-23T00:00:00Z",
  };
}

function runtimeToolResultEntry({
  id,
  instanceId = "",
  eventId,
}: {
  id: string;
  instanceId?: string;
  eventId: number;
}): TimelineEntry {
  return {
    id,
    instanceId,
    sessionId: "session-1",
    runId: "run-output",
    roleId: "MainAgent",
    kind: "tool_result",
    text: "execute_command",
    payload: {
      result: { ok: true, data: "done" },
      tool_call_id: "tool-live-1",
      action_family: "run",
      semantic_category: "execution",
      tool_name: "execute_command",
    },
    eventId,
    occurredAt: "2026-06-23T00:00:00Z",
  };
}

function runtimeApprovalRequestEntry({
  id,
  instanceId = "",
  eventId,
}: {
  id: string;
  instanceId?: string;
  eventId: number;
}): TimelineEntry {
  return {
    id,
    instanceId,
    sessionId: "session-1",
    runId: "run-output",
    roleId: "MainAgent",
    kind: "tool_approval_requested",
    text: "execute_command",
    payload: {
      args_preview: "npm test",
      tool_call_id: "approval-live-1",
      action_family: "run",
      semantic_category: "execution",
      tool_name: "execute_command",
    },
    eventId,
    occurredAt: "2026-06-23T00:00:00Z",
  };
}

function runtimeThinkingDeltaEntry({
  id,
  instanceId = "",
  text,
  eventId,
}: {
  id: string;
  instanceId?: string;
  text: string;
  eventId: number;
}): TimelineEntry {
  return {
    id,
    instanceId,
    sessionId: "session-1",
    runId: "run-output",
    roleId: "MainAgent",
    kind: "thinking_delta",
    text,
    payload: { part_index: 0, text },
    eventId,
    occurredAt: "2026-06-23T00:00:00Z",
  };
}

function runtimeGenericEntry({
  id,
  instanceId,
  kind,
  roleId = "MainAgent",
  runId = "run-output",
  taskId,
  text,
  eventId,
  payload,
}: {
  id: string;
  instanceId?: string;
  kind: TimelineEntry["kind"];
  roleId?: string;
  runId?: string;
  taskId?: string;
  text: string;
  eventId: number;
  payload?: TimelineEntry["payload"];
}): TimelineEntry {
  return {
    id,
    instanceId,
    sessionId: "session-1",
    runId,
    taskId,
    roleId,
    kind,
    text,
    payload: payload ?? { title: text },
    eventId,
    occurredAt: "2026-06-23T00:00:00Z",
  };
}

interface MockElementMeasurementsOptions {
  clientHeight?: number;
  rowHeight?: number | ((row: HTMLElement) => number);
}

function mockElementMeasurements(
  options: MockElementMeasurementsOptions = {},
): () => void {
  const clientHeightDescriptor = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    "clientHeight",
  );
  const heightDescriptor = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    "offsetHeight",
  );
  const scrollHeightDescriptor = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    "scrollHeight",
  );
  const widthDescriptor = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    "offsetWidth",
  );
  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    get() {
      if (this instanceof HTMLElement && this.classList.contains("at-timeline")) {
        return options.clientHeight ?? 720;
      }
      return 0;
    },
  });
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
    configurable: true,
    get() {
      if (this instanceof HTMLElement && this.classList.contains("at-timeline")) {
        return options.clientHeight ?? 720;
      }
      if (this instanceof HTMLElement && this.classList.contains("at-message")) {
        if (options.rowHeight !== undefined) {
          return typeof options.rowHeight === "function"
            ? options.rowHeight(this)
            : options.rowHeight;
        }
        return this.dataset.index === "0" ? 640 : 88;
      }
      return 0;
    },
  });
  Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
    configurable: true,
    get() {
      if (this instanceof HTMLElement && this.classList.contains("at-timeline")) {
        return timelineVirtualHeight(this);
      }
      return 0;
    },
  });
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
    configurable: true,
    get() {
      return 1024;
    },
  });
  return () => {
    restoreProperty(HTMLElement.prototype, "clientHeight", clientHeightDescriptor);
    restoreProperty(HTMLElement.prototype, "offsetHeight", heightDescriptor);
    restoreProperty(HTMLElement.prototype, "scrollHeight", scrollHeightDescriptor);
    restoreProperty(HTMLElement.prototype, "offsetWidth", widthDescriptor);
  };
}

function mockTimelineRects(): () => void {
  const rectDescriptor = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    "getBoundingClientRect",
  );
  Object.defineProperty(HTMLElement.prototype, "getBoundingClientRect", {
    configurable: true,
    value(this: HTMLElement) {
      if (this.classList.contains("at-timeline")) {
        return domRect(0, 0, 1024, this.clientHeight);
      }
      if (this.classList.contains("at-timeline-row")) {
        const timeline = this.closest<HTMLElement>(".at-timeline");
        const top = translateY(this) - (timeline?.scrollTop ?? 0);
        return domRect(0, top, 1024, this.offsetHeight);
      }
      return domRect(0, 0, 0, 0);
    },
  });
  return () => {
    restoreProperty(
      HTMLElement.prototype,
      "getBoundingClientRect",
      rectDescriptor,
    );
  };
}

function domRect(
  left: number,
  top: number,
  width: number,
  height: number,
): DOMRect {
  return {
    bottom: top + height,
    height,
    left,
    right: left + width,
    top,
    width,
    x: left,
    y: top,
    toJSON() {
      return {
        bottom: top + height,
        height,
        left,
        right: left + width,
        top,
        width,
        x: left,
        y: top,
      };
    },
  };
}

function timelineElement(container: HTMLElement): HTMLElement {
  const timeline = container.querySelector(".at-timeline");
  if (!(timeline instanceof HTMLElement)) {
    throw new Error("Timeline element was not rendered.");
  }
  return timeline;
}

function timelineMaxScrollTop(timeline: HTMLElement): number {
  return Math.max(0, timeline.scrollHeight - timeline.clientHeight);
}

function timelineVirtualHeight(timeline: HTMLElement): number {
  const virtualElement = timeline.querySelector<HTMLElement>(".at-timeline-virtual");
  return Number.parseFloat(virtualElement?.style.height ?? "") || 0;
}

function toolPreviewTexts(container: ParentNode): string[] {
  return Array.from(container.querySelectorAll(".at-message-tool-preview"))
    .map((element) => element.textContent?.trim() ?? "")
    .filter((text) => text.length > 0);
}

function toolPreElements(container: ParentNode): HTMLElement[] {
  return Array.from(container.querySelectorAll(".at-message-tool pre"))
    .filter((element): element is HTMLElement => element instanceof HTMLElement);
}

function toolPreElement(container: ParentNode): HTMLElement {
  const element = container.querySelector(".at-message-tool-body");
  if (element instanceof HTMLElement) {
    return element;
  }
  const fallback = toolPreElements(container).at(0);
  if (fallback === undefined) {
    throw new Error("Expected a tool details pre element.");
  }
  return fallback;
}

function textOccurrenceCount(text: string, needle: string): number {
  if (needle.length === 0) {
    return 0;
  }
  return text.split(needle).length - 1;
}

function screenElement(element: HTMLElement): HTMLElement {
  const toolBlock = element.closest(".at-message-tool");
  return toolBlock instanceof HTMLElement ? toolBlock : element;
}

function messageArticle(element: HTMLElement): HTMLElement {
  const article = element.closest("article.at-message");
  if (!(article instanceof HTMLElement)) {
    throw new Error("Expected element to be inside a rendered message article.");
  }
  return article;
}

function restoreProperty<TObject extends object, TKey extends keyof TObject>(
  target: TObject,
  propertyName: TKey,
  descriptor: PropertyDescriptor | undefined,
): void {
  if (descriptor === undefined) {
    delete target[propertyName];
    return;
  }
  Object.defineProperty(target, propertyName, descriptor);
}

function translateY(element: Element | null): number {
  if (!(element instanceof HTMLElement)) {
    return 0;
  }
  const match = element.style.transform.match(/translateY\(([-\d.]+)px\)/);
  return match?.[1] === undefined ? 0 : Number(match[1]);
}
