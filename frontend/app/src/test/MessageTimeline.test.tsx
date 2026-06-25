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
import type { TimelineEntry } from "../runtime/reducers";
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

    renderTimeline();

    const copyButton = await screen.findByRole("button", {
      name: "Copy last answer",
    });
    await waitFor(() => expect(copyButton).toBeEnabled());
    fireEvent.click(copyButton);

    await waitFor(() => expect(writeText).toHaveBeenCalledWith("Latest answer"));
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

  it("keeps single-round sessions full width without the round rail", async () => {
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
    expect(container.querySelector(".at-timeline-frame")).not.toHaveClass("has-round-rail");
    expect(screen.queryByRole("navigation", { name: "Rounds" })).toBeNull();
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
    expect(container.querySelectorAll(".at-message-tool")).toHaveLength(3);
    expect(screen.getByText(/"cmd": "npm test"/)).not.toBeVisible();
    expect(screen.getByText("tests passed")).not.toBeVisible();
    expect(screen.getByText("path is required")).not.toBeVisible();

    fireEvent.click(screen.getByText("Tool call: execute_command"));

    expect(screen.getByText(/"cmd": "npm test"/)).toBeVisible();
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
          ],
        },
        message_id: "assistant-failed-tools",
        role_id: "MainAgent",
      },
    ]);

    renderTimeline();

    const errorTitles = await screen.findAllByText("Tool error: execute_command");
    expect(errorTitles).toHaveLength(3);
    expect(screen.getByText("explicit tool failure")).not.toBeVisible();
    expect(screen.getByText("denied by policy")).not.toBeVisible();
    expect(screen.getByText(/"ok": false/)).not.toBeVisible();
    expect(screen.getByText(/"error": "cd failed"/)).not.toBeVisible();

    fireEvent.click(errorTitles[2]);

    expect(screen.getByText(/"ok": false/)).toBeVisible();
    expect(screen.getByText(/"error": "cd failed"/)).toBeVisible();
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
    expect(screen.getByText(/Args: npm test/)).not.toBeVisible();
    expect(screen.getByText(/Options: Allow once, Deny/)).not.toBeVisible();
    const approvalDenied = screen.getByText("Approval denied: execute_command");
    expect(approvalDenied).toBeVisible();
    expect(screen.getByText(/Action: deny/)).not.toBeVisible();
    expect(screen.getByText(/Feedback: Unsafe command/)).not.toBeVisible();

    fireEvent.click(approvalRequest);

    expect(screen.getByText(/Args: npm test/)).toBeVisible();
    expect(screen.getByText(/Options: Allow once, Deny/)).toBeVisible();

    fireEvent.click(approvalDenied);

    expect(screen.getByText(/Action: deny/)).toBeVisible();
    expect(screen.getByText(/Feedback: Unsafe command/)).toBeVisible();
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
    expect(screen.getByText("run failed")).toBeVisible();
    const thinkingBlock = container.querySelector(".at-message-thinking");
    expect(thinkingBlock).toHaveTextContent("thought before failure");
    expect(thinkingBlock).toHaveAttribute("data-streaming", "false");
    expect(thinkingBlock).not.toHaveAttribute("open");
    expect(screen.queryByText("Live")).not.toBeInTheDocument();
  });

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

    expect(await screen.findByText("run completed")).toBeVisible();
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
            lastEventId: 3,
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
    expect(
      screen.getByText(/Input validation failed before tool execution/),
    ).not.toBeVisible();
    expect(screen.getByText(/"cmd": "npm test"/)).not.toBeVisible();
    expect(screen.getByText(/"ok": false/)).not.toBeVisible();
    expect(screen.getByText(/"error": "command failed"/)).not.toBeVisible();
    expect(screen.getByText(/cmd is required/)).not.toBeVisible();

    fireEvent.click(screen.getByText("Tool validation: execute_command"));

    expect(
      screen.getByText(/Input validation failed before tool execution/),
    ).toBeVisible();
    expect(screen.getByText(/cmd is required/)).toBeVisible();
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
        id: "run-meta:1:0",
        kind: "model_step_started",
        text: "model step visible",
        eventId: 1,
      }),
      runtimeGenericEntry({
        id: "run-meta:2:1",
        kind: "generation_progress",
        text: "runtime setup downloading",
        eventId: 2,
      }),
      runtimeGenericEntry({
        id: "run-meta:3:2",
        kind: "injection_applied",
        text: "injection applied visible",
        eventId: 3,
      }),
      runtimeGenericEntry({
        id: "run-meta:4:3",
        kind: "notification_requested",
        text: "notification visible",
        eventId: 4,
      }),
      runtimeGenericEntry({
        id: "run-meta:5:4",
        kind: "subagent_session_status_changed",
        text: "subagent session visible",
        eventId: 5,
      }),
      runtimeGenericEntry({
        id: "run-meta:6:5",
        kind: "awaiting_manual_action",
        text: "manual action visible",
        eventId: 6,
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

    expect(await screen.findByText("model step visible")).toBeVisible();
    expect(screen.getByText("runtime setup downloading")).toBeVisible();
    expect(screen.getByText("injection applied visible")).toBeVisible();
    expect(screen.getByText("notification visible")).toBeVisible();
    expect(screen.getByText("subagent session visible")).toBeVisible();
    expect(screen.getByText("manual action visible")).toBeVisible();
    expect(screen.getByText("hook event visible")).toBeVisible();
  });

  it("renders markdown, GFM tables, links, and highlighted code blocks", async () => {
    listSessionMessagesMock.mockResolvedValue([
      {
        content: [
          "## Plan",
          "",
          "| Step | State |",
          "| --- | --- |",
          "| Timeline | Done |",
          "",
          "[Docs](https://example.test/docs)",
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
      await screen.findByRole("heading", { level: 2, name: "Plan" }),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Docs" })).toHaveAttribute(
      "href",
      "https://example.test/docs",
    );
    expect(screen.getByRole("cell", { name: "Timeline" })).toBeVisible();
    expect(screen.getByRole("cell", { name: "Done" })).toBeVisible();
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

function renderTimeline(sessionId: string | null = "session-1") {
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
          <MessageTimeline sessionId={sessionId} />
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

function setRuntimeEntries(entries: TimelineEntry[]): void {
  const runId = entries[0]?.runId ?? "run-output";
  const lastEventId = entries.reduce(
    (latest, entry) => Math.max(latest, entry.eventId),
    0,
  );
  useRuntimeStore.setState({
    runtimeState: {
      activeRunIds: [],
      runs: {
        [runId]: {
          runId,
          status: "closed",
          lastEventId,
          seenEventKeys: [],
          terminalEventType: null,
          entries,
        },
      },
    },
  });
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
