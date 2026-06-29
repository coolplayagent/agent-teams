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

import { listSessionMessages, listSessionRounds } from "../api/client";
import { MessageTimeline } from "../features/timeline/MessageTimeline";
import type { RelayRunEvent, StreamStatus } from "../runtime/events";
import {
  initialRuntimeState,
  reduceRunEvent,
  type TimelineEntry,
} from "../runtime/reducers";
import { useRuntimeStore } from "../runtime/runtimeStore";

vi.mock("../api/client", () => ({
  listSessionMessages: vi.fn(),
  listSessionRounds: vi.fn(),
}));

const listSessionMessagesMock = vi.mocked(listSessionMessages);
const listSessionRoundsMock = vi.mocked(listSessionRounds);

beforeEach(() => {
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

describe("MessageTimeline", () => {
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

    expect(await screen.findByText(resumedText)).toBeVisible();
    expect(screen.queryAllByText(resumedText)).toHaveLength(1);
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
    expect(await screen.findByText("Run completed: status completed")).toBeVisible();
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

  it("renders the round rail from session rounds and marks selected rounds", async () => {
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
    expect(screen.getAllByText("completed")[0]).toBeVisible();
    expect(screen.getByText("6s")).toBeVisible();
    expect(listSessionRoundsMock).toHaveBeenCalledWith("session-1", {
      cursorRunId: null,
      limit: 100,
    });
    expect(followUpRound).toHaveAttribute("aria-current", "step");

    fireEvent.click(initialRound);

    expect(initialRound).toHaveAttribute("aria-current", "step");
    expect(followUpRound).not.toHaveAttribute("aria-current");
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
    expect(marker).toHaveTextContent("completed");
    expect(marker).not.toHaveTextContent("running");
    expect(marker).not.toHaveTextContent("streaming");
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
        message_id: "assistant-1",
        role_id: "MainAgent",
        trace_id: "run-1",
        content: "Full persisted answer",
      },
    ]);

    renderTimeline();

    const copyButton = await screen.findByRole("button", {
      name: "Copy last answer",
    });
    await waitFor(() => expect(copyButton).toBeEnabled());
    fireEvent.click(copyButton);

    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith("Full persisted answer"),
    );
    expect(writeText).not.toHaveBeenCalledWith("final chunk only");
    expect(screen.queryByText("final chunk only")).not.toBeInTheDocument();
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
    expect(await screen.findByText("Tool call: execute_command")).toBeVisible();
    expect(screen.getByText("Tool error: execute_command")).toBeVisible();
    expect(toolPreviewTexts(container)).toEqual([
      "npm test",
      "File not found: .",
    ]);
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
      },
    ]);

    renderTimeline();

    expect(await screen.findByText("Actual user prompt")).toBeVisible();
    expect(screen.queryByText("## Skill Candidates")).not.toBeInTheDocument();
    expect(screen.queryByText(/hidden: internal routing text/)).not.toBeInTheDocument();
    expect(screen.queryByText("message")).not.toBeInTheDocument();
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
              tool_name: "execute_command",
            },
            {
              content: "tests passed",
              kind: "tool-return",
              tool_call_id: "tool-1",
              tool_name: "execute_command",
            },
            {
              content: "path is required",
              part_kind: "retry-prompt",
              tool_call_id: "tool-2",
              tool_name: "read_file",
            },
            {
              args: { pattern: "**/*.ts" },
              kind: "tool-call",
              tool_call_id: "tool-3",
              tool_name: "glob",
            },
          ],
        },
        message_id: "assistant-tools",
        role_id: "MainAgent",
      },
    ]);

    const { container } = renderTimeline();

    expect(await screen.findByText("Tool call: execute_command")).toBeVisible();
    expect(screen.getByText("Tool result: execute_command")).toBeVisible();
    expect(screen.getByText("Tool validation: read_file")).toBeVisible();
    expect(screen.getByText("Tool call: glob")).toBeVisible();
    expect(screen.getByText("Tool call: execute_command"))
      .toHaveAttribute("title", "Tool call: execute_command");
    expect(screen.getByText("npm test")).toHaveAttribute("title", "npm test");
    expect(container.querySelectorAll(".at-message-tool")).toHaveLength(4);
    expect(toolPreviewTexts(container)).toEqual([
      "npm test",
      "tests passed",
      "path is required",
      "**/*.ts",
    ]);
    expect(screen.getByText(/"cmd": "npm test"/)).not.toBeVisible();

    fireEvent.click(screen.getByText("Tool call: execute_command"));

    expect(screen.getByText(/"cmd": "npm test"/)).toBeVisible();
  });

  it("normalizes string tool args for persisted and runtime tool calls", async () => {
    setRuntimeStateFromEvents([
      relayRunEvent({
        event_id: 1,
        event_type: "tool_call",
        payload_json: JSON.stringify({
          args: "{\"query\":\"Anthropic funding 2026\"}",
          tool_call_id: "call-live",
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
              tool_name: "websearch",
            },
          ],
        },
        message_id: "assistant-string-tool-args",
        role_id: "MainAgent",
      },
    ]);

    const { container } = renderTimeline();

    expect(await screen.findAllByText("Tool call: websearch")).toHaveLength(2);
    expect(screen.getByText("Tool call: batch")).toBeVisible();
    expect(screen.getByText("Tool call: raw")).toBeVisible();
    expect(toolPreviewTexts(container)).toEqual([
      "Anthropic safety policy",
      "Anthropic funding 2026",
      "one, two",
      "not json",
    ]);
    const details = toolPreElements(container).map(
      (element) => element.textContent ?? "",
    );
    expect(details.some((detail) =>
      detail.includes("\"query\": \"Anthropic safety policy\""),
    )).toBe(true);
    expect(details.some((detail) =>
      detail.includes("\"query\": \"Anthropic funding 2026\""),
    )).toBe(true);
    expect(details.some((detail) =>
      detail.includes("\"__items\"") &&
        detail.includes("\"one\"") &&
        detail.includes("\"two\""),
    )).toBe(true);
    expect(details.some((detail) =>
      detail.includes("\"__raw\": \"not json\""),
    )).toBe(true);
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
          tool_name: "shell",
        }),
      }),
    ]);
    listSessionMessagesMock.mockResolvedValue([]);

    const parentTimeline = renderTimeline("session-1", {
      runtimeRunId: "run-parent",
    });

    expect(await screen.findByText("parent hello")).toBeVisible();
    expect(screen.queryByText("Tool call: shell")).not.toBeInTheDocument();
    expect(
      parentTimeline.container.querySelectorAll("article.at-message"),
    ).toHaveLength(1);

    parentTimeline.unmount();

    const childTimeline = renderTimeline("session-1", {
      runtimeRunId: "subagent_run_1",
    });

    expect(await screen.findByText("Tool call: shell")).toBeVisible();
    expect(screen.queryByText("parent hello")).not.toBeInTheDocument();
    expect(toolPreviewTexts(childTimeline.container)).toEqual(["echo ok"]);
    expect(
      childTimeline.container.querySelectorAll("article.at-message"),
    ).toHaveLength(1);
  });

  it("keeps completed runtime tool results when stale tool calls arrive later", async () => {
    setRuntimeStateFromEvents([
      relayRunEvent({
        event_id: 2,
        event_type: "tool_result",
        payload_json: JSON.stringify({
          result: { ok: true, output: "done" },
          tool_call_id: "call-b",
          tool_name: "shell",
        }),
      }),
      relayRunEvent({
        event_id: 1,
        event_type: "tool_call",
        payload_json: JSON.stringify({
          args: { command: "echo b" },
          tool_call_id: "call-b",
          tool_name: "shell",
        }),
      }),
    ]);
    listSessionMessagesMock.mockResolvedValue([]);

    const { container } = renderTimeline();

    expect(await screen.findByText("Tool result: shell")).toBeVisible();
    expect(screen.queryByText("Tool call: shell")).not.toBeInTheDocument();
    expect(screen.queryByText("echo b")).not.toBeInTheDocument();
    expect(toolPreviewTexts(container)).toEqual(["done"]);
    expect(container.querySelectorAll("article.at-message")).toHaveLength(1);
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
              tool_name: "shell",
            },
          ],
        },
        message_id: "assistant-success-tool",
        role_id: "MainAgent",
      },
    ]);

    renderTimeline();

    const resultTitle = await screen.findByText("Tool result: shell");
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
              tool_name: "execute_command",
            },
            {
              content: "denied by policy",
              outcome: "denied",
              part_kind: "tool-return",
              tool_call_id: "tool-2",
              tool_name: "execute_command",
            },
            {
              content: { error: "cd failed", ok: false },
              part_kind: "tool-return",
              tool_call_id: "tool-3",
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
              tool_name: "read",
            },
          ],
        },
        message_id: "assistant-failed-tools",
        role_id: "MainAgent",
      },
    ]);

    const { container } = renderTimeline();

    const errorTitles = await screen.findAllByText("Tool error: execute_command");
    const readErrorTitle = await screen.findByText("Tool error: read");
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

    renderTimeline();

    const approvalRequest = await screen.findByText("Approval requested: execute_command");
    expect(approvalRequest).toBeVisible();
    expect(toolPreviewTexts(screenElement(approvalRequest))).toEqual([
      "Args: npm test",
    ]);
    const approvalRequestDetails = toolPreElement(screenElement(approvalRequest));
    expect(approvalRequestDetails).not.toBeVisible();
    expect(approvalRequestDetails).toHaveTextContent(/Args: npm test/);
    expect(approvalRequestDetails).toHaveTextContent(/Options: Allow once, Deny/);
    const approvalDenied = screen.getByText("Approval denied: execute_command");
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

  it("renders long open runtime text streams as one plain text block", async () => {
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
      expect(container.querySelector(".at-message-plain-stream")).not.toBeNull(),
    );
    const plainStream = container.querySelector<HTMLElement>(".at-message-plain-stream");
    expect(plainStream).toHaveAttribute("data-render-mode", "plain-stream");
    expect(plainStream?.textContent).toHaveLength(13000);
    expect(plainStream?.textContent).toBe(`${prefix}${suffix}`);
    expect(container.querySelectorAll(".streaming-cursor")).toHaveLength(1);
    expect(container.querySelector(".at-message-markdown")).toBeNull();
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
    ]);
    listSessionMessagesMock.mockResolvedValue([]);

    const { container } = renderTimeline();

    expect(await screen.findByText("before tool")).toBeVisible();
    expect(screen.getByText("Tool call: execute_command")).toBeVisible();
    expect(screen.getByText("after tool")).toBeVisible();
    expect(container.querySelectorAll("article.at-message")).toHaveLength(3);
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
    expect(screen.getByText("Tool call: shell")).toBeVisible();
    expect(screen.getByText("second cursorless chunk")).toBeVisible();
    expect(toolPreviewTexts(container)).toEqual(["pwd"]);
    const rowTexts = Array.from(container.querySelectorAll("article.at-message"))
      .map((row) => row.textContent ?? "");
    expect(rowTexts).toHaveLength(3);
    expect(rowTexts[0]).toContain("first cursorless chunk");
    expect(rowTexts[1]).toContain("Tool call: shell");
    expect(rowTexts[2]).toContain("second cursorless chunk");
  });

  it("keeps runtime injection rows at their live event position between tool and text", async () => {
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
    ]);
    listSessionMessagesMock.mockResolvedValue([]);

    const { container } = renderTimeline();

    expect(await screen.findByText("Tool call: execute_command")).toBeVisible();
    expect(
      screen.getByText("Injection applied: Use OpenAI instead · source user"),
    ).toBeVisible();
    expect(screen.getByText("Switching the search target to OpenAI.")).toBeVisible();
    const rowTexts = Array.from(container.querySelectorAll("article.at-message"))
      .map((row) => row.textContent ?? "");
    expect(rowTexts).toHaveLength(3);
    expect(rowTexts[0]).toContain("Tool call: execute_command");
    expect(rowTexts[1]).toContain("Injection applied: Use OpenAI instead");
    expect(rowTexts[2]).toContain("Switching the search target to OpenAI.");
  });

  it("removes superseded pending runtime tool calls before rendering the injected replacement", async () => {
    setRuntimeStateFromEvents([
      relayRunEvent({
        event_id: 1,
        event_type: "tool_call",
        payload_json: JSON.stringify({
          args: { command: "pwd" },
          tool_call_id: "call-old",
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
          tool_name: "shell",
        }),
      }),
      relayRunEvent({
        event_id: 4,
        event_type: "tool_result",
        payload_json: JSON.stringify({
          result: { ok: true, output: "done" },
          tool_call_id: "call-new",
          tool_name: "shell",
        }),
      }),
    ]);
    listSessionMessagesMock.mockResolvedValue([]);

    const { container } = renderTimeline();

    expect(
      await screen.findByText("Injection applied: Use ls instead · source user"),
    ).toBeVisible();
    expect(screen.getAllByText("Tool call: shell")).toHaveLength(1);
    expect(screen.getByText("Tool result: shell")).toBeVisible();
    const previews = toolPreviewTexts(container);
    expect(previews).not.toContain("pwd");
    expect(previews).toContain("ls");
    expect(previews).toContain("done");
    expect(screen.queryByText("pwd")).not.toBeInTheDocument();
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
    ]);
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
    const thinkingBlocks = container.querySelectorAll(".at-message-thinking");
    expect(thinkingBlocks).toHaveLength(2);
    expect(thinkingBlocks[0]).toHaveAttribute("data-part-index", "0");
    expect(thinkingBlocks[0]).not.toHaveAttribute("open");
    expect(thinkingBlocks[0]).toHaveTextContent("first thought");
    expect(thinkingBlocks[0]).not.toHaveTextContent("second thought");
    expect(thinkingBlocks[1]).toHaveAttribute("data-part-index", "0");
    expect(thinkingBlocks[1]).not.toHaveAttribute("open");
    expect(thinkingBlocks[1]).toHaveTextContent("second thought");
    expect(thinkingBlocks[1]).not.toHaveTextContent("first thought");
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

    expect(await screen.findByText("Thinking")).toBeVisible();
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

  it.each([
    [
      "run_failed",
      {
        error: "Provider failed during TS stream.",
        root_task_id: "root-v2",
        status: "failed",
      },
      "Run failed: status failed · Provider failed during TS stream. · root task root-v2",
    ],
    [
      "run_stopped",
      {
        reason: "Stopped from TS stream.",
        root_task_id: "root-v2",
        status: "stopped",
      },
      "Run stopped: status stopped · Stopped from TS stream. · root task root-v2",
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

    expect(await screen.findByText("Run completed: run completed")).toBeVisible();
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
            ],
          },
        },
      },
    });
    listSessionMessagesMock.mockResolvedValue([]);

    const { container } = renderTimeline();

    expect(await screen.findByText("thinking payload fallback")).toBeVisible();
    expect(screen.getByText("thinking delta missing text fallback")).toBeVisible();
    expect(screen.getByText("thinking delta number fallback")).toBeVisible();
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

    renderTimeline();

    expect(await screen.findByText("Tool call: execute_command")).toBeVisible();
    expect(screen.getByText("Tool error: execute_command")).toBeVisible();
    expect(screen.getByText("Tool validation: execute_command")).toBeVisible();
    expect(screen.getByText("Tool error: shell")).toBeVisible();
    expect(toolPreviewTexts(screenElement(screen.getByText("Tool call: execute_command"))))
      .toContain("npm test");
    expect(toolPreviewTexts(screenElement(screen.getByText("Tool error: execute_command"))))
      .toContain("command failed");
    expect(toolPreviewTexts(screenElement(screen.getByText("Tool validation: execute_command"))))
      .toContain("Input validation failed before tool execution.");
    expect(toolPreviewTexts(screenElement(screen.getByText("Tool error: shell"))))
      .toContain("missing");
    expect(screen.getByText(/"cmd": "npm test"/)).not.toBeVisible();
    expect(screen.queryByText(/"ok": false/)).not.toBeInTheDocument();
    expect(screen.queryByText(/"error": "command failed"/)).not.toBeInTheDocument();
    const validationDetails = toolPreElement(
      screenElement(screen.getByText("Tool validation: execute_command")),
    );
    expect(validationDetails).not.toBeVisible();
    expect(validationDetails).toHaveTextContent(/cmd is required/);

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

  it("renders runtime token usage events as compact usage summaries", async () => {
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

    expect(
      await screen.findByText(
        "Token usage: Total 18 · Input 11 · Cached 2 · Output 7 · Reasoning 3",
      ),
    ).toBeVisible();
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
      await screen.findByText(
        "Model step started: role coordinator · instance coordinator-1",
      ),
    ).toBeVisible();
    expect(screen.getByText("Model step finished: model pass complete")).toBeVisible();
    expect(
      screen.getByText("Notification: Run failed · type run_failed · channels desktop, feishu"),
    ).toBeVisible();
    expect(
      screen.getByText(
        "Background task started: npm run watch · status running · kind command · #background-task-1",
      ),
    ).toBeVisible();
    expect(
      screen.getByText(
        "Background task updated: Compiled successfully · status running · #background-task-1",
      ),
    ).toBeVisible();
    expect(
      screen.getByText(
        "Background task completed: Build finished · status completed · exit 0 · #background-task-1",
      ),
    ).toBeVisible();
    expect(screen.queryByText("model step started")).not.toBeInTheDocument();
    expect(screen.queryByText("notification requested")).not.toBeInTheDocument();
    expect(screen.queryByText("background task started")).not.toBeInTheDocument();
  });

  it("renders runtime coordination events as labelled summaries", async () => {
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

    expect(
      await screen.findByText("User question: Pick deployment target · #question-1"),
    ).toBeVisible();
    expect(screen.getByText("User question answered: 1 answer · #question-1")).toBeVisible();
    expect(
      screen.getByText(
        "Injection queued: Please retry with logs · source user · mode queued · to worker-1",
      ),
    ).toBeVisible();
    expect(
      screen.getByText(
        "Injection applied: System reminder · source system · mode guidance · to worker-1",
      ),
    ).toBeVisible();
    expect(
      screen.getByText(
        "Subagent status: Review PR · status running · phase subagent_running · role reviewer · instance subagent-1",
      ),
    ).toBeVisible();
    expect(
      screen.getByText(
        "Subagent stopped: reason stopped_by_user · role reviewer · instance subagent-1 · task task-1",
      ),
    ).toBeVisible();
    expect(
      screen.getByText("Subagent resumed: role reviewer · instance subagent-1 · task task-1"),
    ).toBeVisible();
    expect(screen.getByText("Awaiting manual action: root task root-1")).toBeVisible();
    expect(screen.getByText("Run started: phase: streaming")).toBeVisible();
    expect(
      screen.getByText("Run failed: status failed · Provider failed · root task root-1"),
    ).toBeVisible();
    expect(screen.queryByText("user question requested")).not.toBeInTheDocument();
    expect(screen.queryByText("injection enqueued")).not.toBeInTheDocument();
    expect(screen.queryByText("subagent session status changed")).not.toBeInTheDocument();
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

      expect(await screen.findByText("Tool call: execute_command")).toBeVisible();
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
      fireEvent.pointerDown(toolSummary as HTMLElement);
      fireEvent.click(toolSummary as HTMLElement);

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
      await waitFor(() =>
        expect(timelineMaxScrollTop(timeline)).toBeGreaterThan(previousScrollTop),
      );
      expect(timeline.scrollTop).toBe(previousScrollTop);
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
      listSessionRoundsMock.mockReturnValue(roundsDeferred.promise);

      const { container } = renderTimeline();

      expect(await screen.findByText("Persisted message 6")).toBeVisible();
      const timeline = timelineElement(container);
      const anchorRow = container.querySelector(
        'article.at-message[data-row-key="message:assistant-4"]',
      );
      expect(anchorRow).not.toBeNull();
      const anchorTop = translateY(anchorRow);
      timeline.scrollTop = anchorTop + 10;
      fireEvent.scroll(timeline);

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

      await waitFor(() =>
        expect(container.querySelectorAll(".at-round-marker")).toHaveLength(6),
      );
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
  runtimeRunId?: string | null;
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
  return render(
    <QueryClientProvider client={queryClient}>
      <ConfigProvider>
        <AntApp>
          <MessageTimeline
            sessionId={sessionId}
            runtimeRunId={options.runtimeRunId ?? null}
          />
        </AntApp>
      </ConfigProvider>
    </QueryClientProvider>,
  );
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
): void {
  const runId = entries[0]?.runId ?? "run-output";
  const lastEventId = entries.reduce(
    (latest, entry) => Math.max(latest, entry.eventId),
    0,
  );
  useRuntimeStore.setState({
    runtimeState: {
      activeRunIds: status === "open" ? [runId] : [],
      runs: {
        [runId]: {
          runId,
          status,
          lastEventId,
          seenEventKeys: [],
          terminalEventType: null,
          entries,
        },
      },
    },
  });
}

function setRuntimeStateFromEvents(events: RelayRunEvent[]): void {
  useRuntimeStore.setState({
    runtimeState: events.reduce(reduceRunEvent, initialRuntimeState),
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
  kind,
  text,
  eventId,
  payload,
}: {
  id: string;
  kind: TimelineEntry["kind"];
  text: string;
  eventId: number;
  payload?: TimelineEntry["payload"];
}): TimelineEntry {
  return {
    id,
    sessionId: "session-1",
    runId: "run-output",
    roleId: "MainAgent",
    kind,
    text,
    payload: payload ?? { title: text },
    eventId,
    occurredAt: "2026-06-23T00:00:00Z",
  };
}

interface MockElementMeasurementsOptions {
  clientHeight?: number;
  rowHeight?: number;
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
          return options.rowHeight;
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
  const element = toolPreElements(container).at(0);
  if (element === undefined) {
    throw new Error("Expected a tool details pre element.");
  }
  return element;
}

function screenElement(element: HTMLElement): HTMLElement {
  const toolBlock = element.closest(".at-message-tool");
  return toolBlock instanceof HTMLElement ? toolBlock : element;
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
